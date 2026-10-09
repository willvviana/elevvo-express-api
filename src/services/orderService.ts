// src/services/orderService.ts

import * as store from "../lib/store.js";
import type { OrderWithItems } from "../lib/store.js";
import { NotFoundError, ValidationError } from "./userService.js";

export interface PlaceOrderInput {
  items: { productId: number; quantity: number }[];
}

export interface PaginatedOrders {
  orders: OrderWithItems[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

/**
 * Place a new order for the given user.
 *
 * The userId comes from the JWT — NOT from the request body.
 * If it came from the body, any authenticated user could place
 * orders on behalf of anyone else.
 */
export async function placeOrder(
  userId: number,
  input: PlaceOrderInput,
): Promise<OrderWithItems> {
  validateOrderInput(input);

  try {
    return await store.createOrderWithItems({ userId, items: input.items });
  } catch (err) {
    // The store throws plain Error with specific messages for
    // expected business failures (out of stock, missing product).
    // Re-throw as ValidationError so the controller maps to 400.
    if (err instanceof Error) {
      if (err.message.includes("not found")) {
        throw new ValidationError(err.message);
      }
      if (err.message.includes("Insufficient stock")) {
        throw new ValidationError(err.message);
      }
    }
    throw err;
  }
}

/**
 * List the authenticated user's orders.
 */
export async function listMyOrders(
  userId: number,
  page: number,
  perPage: number,
): Promise<PaginatedOrders> {
  const safePage = Math.max(1, page);
  const safePerPage = Math.min(50, Math.max(1, perPage));
  const skip = (safePage - 1) * safePerPage;

  const { orders, total } = await store.findOrdersByUser({
    userId,
    skip,
    take: safePerPage,
  });

  return {
    orders,
    total,
    page: safePage,
    perPage: safePerPage,
    totalPages: Math.ceil(total / safePerPage),
  };
}

/**
 * Get one order. Enforces ownership: only the owner or an ADMIN can view it.
 */
export async function getOrder(
  orderId: number,
  requesterId: number,
  requesterRole: "ADMIN" | "CUSTOMER",
): Promise<OrderWithItems> {
  const order = await store.findOrderById(orderId);
  if (!order) throw new NotFoundError(orderId);

  // Admins see everything. Customers see only their own.
  // Return 404 for non-owned orders (not 403) to prevent id enumeration.
  if (requesterRole !== "ADMIN" && order.userId !== requesterId) {
    throw new NotFoundError(orderId);
  }

  return order;
}

/* ---------------- Validation ---------------- */

function validateOrderInput(input: PlaceOrderInput): void {
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new ValidationError("Order must contain at least one item");
  }

  if (input.items.length > 50) {
    throw new ValidationError("Order cannot contain more than 50 items");
  }

  for (const item of input.items) {
    if (
      typeof item.productId !== "number" ||
      !Number.isInteger(item.productId) ||
      item.productId <= 0
    ) {
      throw new ValidationError("Each item must have a positive integer productId");
    }
    if (
      typeof item.quantity !== "number" ||
      !Number.isInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      throw new ValidationError("Each item must have a positive integer quantity");
    }
  }

  // Reject duplicate productIds — otherwise "add 2, add 3" could be
  // interpreted differently by different code paths.
  const seen = new Set<number>();
  for (const item of input.items) {
    if (seen.has(item.productId)) {
      throw new ValidationError(`Duplicate productId: ${item.productId}`);
    }
    seen.add(item.productId);
  }
}