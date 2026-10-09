// src/lib/store.ts

import { PrismaClient } from "@prisma/client";
import type { Product, Order, OrderItem } from "@prisma/client";
import type { UserRecord, Role } from "../types/domain.js";
/**
 * Prisma client — singleton.
 *
 * Why a singleton:
 * - Each PrismaClient opens a connection pool. Creating multiple
 *   instances (one per request, one per module) exhausts connections.
 * - Node's module cache means this file is evaluated once, so `prisma`
 *   is shared across the entire app.
 *
 * In dev with hot reload, tsx restarts the process frequently.
 * The `globalThis` trick keeps a single client across restarts.
 * In production it doesn't matter.
 */

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/* ---------------- User operations ---------------- */

export async function findAllUsers(): Promise<UserRecord[]> {
  return prisma.user.findMany({
    orderBy: { id: "asc" },
  });
}

export async function findUserById(id: number): Promise<UserRecord | null> {
  return prisma.user.findUnique({ where: { id } });
}

export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { email: email.toLowerCase() },
  });
}

export async function createUser(input: {
  name: string;
  email: string;
  role: Role;
  passwordHash: string;
}): Promise<UserRecord> {
  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email.toLowerCase(),
      role: input.role,
      passwordHash: input.passwordHash,
    },
  });
}

export async function updateUser(
  id: number,
  patch: Partial<Omit<UserRecord, "id" | "createdAt" | "updatedAt">>,
): Promise<UserRecord | null> {
  try {
    return await prisma.user.update({
      where: { id },
      data: patch,
    });
  } catch (err) {
    // Prisma throws P2025 when the record doesn't exist.
    // Return null instead — service layer converts to NotFoundError.
    if (isPrismaNotFound(err)) return null;
    throw err;
  }
}

export async function deleteUser(id: number): Promise<boolean> {
  try {
    await prisma.user.delete({ where: { id } });
    return true;
  } catch (err) {
    if (isPrismaNotFound(err)) return false;
    throw err;
  }
}

/* ---------------- Helpers ---------------- */

/**
 * Prisma error P2025 = "Record to update/delete not found".
 * We catch it and return null/false, letting the service layer decide.
 */
function isPrismaNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2025"
  );
}

/* ---------------- Product operations ---------------- */

export async function findAllProducts(params: {
  skip: number;
  take: number;
  category?: string;
}): Promise<{ products: Product[]; total: number }> {
  // Run both queries in parallel — count and page can go simultaneously.
  // Prisma sends them as two queries but the network round-trip overlaps.
  const where = params.category ? { category: params.category } : {};

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      skip: params.skip,
      take: params.take,
      orderBy: { id: "asc" },
    }),
    prisma.product.count({ where }),
  ]);

  return { products, total };
}

export async function findProductById(id: number): Promise<Product | null> {
  return prisma.product.findUnique({ where: { id } });
}

export async function createProduct(data: {
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  imageUrl?: string | null;
}): Promise<Product> {
  return prisma.product.create({ data });
}

export async function updateProduct(
  id: number,
  patch: Partial<{
    name: string;
    description: string;
    price: number;
    stock: number;
    category: string;
    imageUrl: string | null;
  }>,
): Promise<Product | null> {
  try {
    return await prisma.product.update({ where: { id }, data: patch });
  } catch (err) {
    if (isPrismaNotFound(err)) return null;
    throw err;
  }
}

export async function deleteProduct(id: number): Promise<boolean> {
  try {
    await prisma.product.delete({ where: { id } });
    return true;
  } catch (err) {
    if (isPrismaNotFound(err)) return false;
    // P2003 = foreign key constraint violation.
    // Happens when a product is referenced by an order item.
    if (isPrismaForeignKeyViolation(err)) {
      throw new Error("Cannot delete product: it is referenced by existing orders");
    }
    throw err;
  }
}

/* ---------------- Helpers ---------------- */

function isPrismaForeignKeyViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: unknown }).code === "P2003"
  );
}

/* ---------------- Order operations ---------------- */

/**
 * Order with its items and the products they reference.
 * This is the shape clients get back — a fully populated order.
 */
export type OrderWithItems = Order & {
  items: (OrderItem & { product: Product })[];
};

/**
 * THE CHECKOUT TRANSACTION.
 *
 * This is the atomic operation the brief asks for. Three things happen:
 *
 * 1. Verify every product exists and has enough stock.
 * 2. Decrement stock for each product.
 * 3. Create the order + order items.
 *
 * All three happen inside `prisma.$transaction`. If ANY step throws,
 * Prisma rolls back every write. Either the whole checkout succeeds,
 * or nothing changed. No half-state where stock decremented but no
 * order was created.
 *
 * WHY THIS MATTERS (the classic bug):
 * Without a transaction, you'd write:
 *
 *   await prisma.product.update({ ... decrement stock ... });
 *   await prisma.order.create({ ... });
 *   await prisma.orderItem.createMany({ ... });
 *
 * If `order.create` fails (validation, connection drop, anything),
 * the stock decrement is already committed. Stock is now wrong, and
 * no order exists to account for it. This is a real, common bug.
 *
 * The transaction wraps all of it. Atomic or nothing.
 */
export async function createOrderWithItems(params: {
  userId: number;
  items: { productId: number; quantity: number }[];
}): Promise<OrderWithItems> {
  return prisma.$transaction(async (tx) => {
    // ---- Step 1: load all products in one query ----
    const productIds = params.items.map((i) => i.productId);

    const products = await tx.product.findMany({
      where: { id: { in: productIds } },
    });

    // Build a lookup map to avoid O(n²) searches.
    const productById = new Map(products.map((p) => [p.id, p]));

    // ---- Step 2: verify every item ----
    let total = 0;

    for (const item of params.items) {
      const product = productById.get(item.productId);
      if (!product) {
        throw new Error(`Product ${item.productId} not found`);
      }
      if (product.stock < item.quantity) {
        throw new Error(
          `Insufficient stock for "${product.name}": requested ${item.quantity}, available ${product.stock}`,
        );
      }

      // Price comes from the DB — never from the client.
      // Prisma Decimal → Number. Total is small enough that float math
      // is acceptable here; in a real system, use a Decimal library.
      total += Number(product.price) * item.quantity;
    }

    // ---- Step 3: decrement stock ----
    for (const item of params.items) {
      await tx.product.update({
        where: { id: item.productId },
        data: { stock: { decrement: item.quantity } },
      });
    }

    // ---- Step 4: create the order ----
    const order = await tx.order.create({
      data: {
        userId: params.userId,
        total,
        status: "PENDING",
        items: {
          // NESTED WRITE: Prisma creates the order and all order items
          // in one call. The orderItem rows reference the order we
          // just created (via `orderId`), and each references a product
          // and snapshots the price at purchase time.
          create: params.items.map((item) => {
            const product = productById.get(item.productId)!;
            return {
              productId: item.productId,
              quantity: item.quantity,
              priceAtPurchase: product.price,
            };
          }),
        },
      },
      // Return the order WITH its items and each item's product.
      include: {
        items: {
          include: { product: true },
        },
      },
    });

    return order;
  });
}

/**
 * List a user's orders with items. Paginated.
 */
export async function findOrdersByUser(params: {
  userId: number;
  skip: number;
  take: number;
}): Promise<{ orders: OrderWithItems[]; total: number }> {
  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where: { userId: params.userId },
      skip: params.skip,
      take: params.take,
      orderBy: { id: "desc" },   // newest first
      include: {
        items: {
          include: { product: true },
        },
      },
    }),
    prisma.order.count({ where: { userId: params.userId } }),
  ]);

  return { orders, total };
}

/**
 * Get one order by id. Includes items and products.
 * Returns null if it doesn't exist. Caller checks ownership.
 */
export async function findOrderById(id: number): Promise<OrderWithItems | null> {
  return prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: { product: true },
      },
    },
  });
}