// tests/orders.test.ts

import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { prisma, resetDatabase, disconnectDb } from "./helpers/db.js";

const app = createApp();

/**
 * Order tests.
 *
 * Covers:
 * - Successful checkout decrements stock.
 * - Rollback on failure — stock is NOT decremented when the order fails.
 * - Insufficient stock is rejected.
 * - Order ownership: customers see only their own orders.
 */

async function createUserAndToken(opts: {
  email: string;
  role: "ADMIN" | "CUSTOMER";
}): Promise<{ token: string; userId: number }> {
  const passwordHash = await bcrypt.hash("password123", 12);
  const user = await prisma.user.create({
    data: {
      email: opts.email,
      name: "Test",
      role: opts.role,
      passwordHash,
    },
  });

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: opts.email, password: "password123" });

  return { token: res.body.token as string, userId: user.id };
}

async function createProduct(name: string, stock: number) {
  return prisma.product.create({
    data: {
      name,
      description: `Description for ${name} with enough characters`,
      price: 25,
      stock,
      category: "Test",
    },
  });
}

describe("Orders", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  test("successful order decrements stock and returns the order", async () => {
    const { token, userId } = await createUserAndToken({
      email: "buyer@example.test",
      role: "CUSTOMER",
    });
    const product = await createProduct("Widget", 10);

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: product.id, quantity: 3 }] });

    expect(res.status).toBe(201);
    expect(res.body.order.userId).toBe(userId);
    expect(res.body.order.total).toBe("75");        // 25 * 3
    expect(res.body.order.items).toHaveLength(1);
    expect(res.body.order.items[0].quantity).toBe(3);
    expect(res.body.order.items[0].priceAtPurchase).toBe("25");

    // Verify stock was actually decremented
    const updated = await prisma.product.findUnique({ where: { id: product.id } });
    expect(updated?.stock).toBe(7);                 // 10 - 3
  });

  test("TRANSACTION ROLLBACK: failed order does NOT decrement any stock", async () => {
    const { token } = await createUserAndToken({
      email: "buyer2@example.test",
      role: "CUSTOMER",
    });
    const product = await createProduct("Real", 10);

    // Valid product + invalid product in the same order.
    // The valid one would normally be decremented first — this test
    // proves the transaction rolls that back.
    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({
        items: [
          { productId: product.id, quantity: 5 },
          { productId: 999999, quantity: 1 },
        ],
      });

    expect(res.status).toBe(400);

    // The critical assertion: stock is unchanged.
    const unchanged = await prisma.product.findUnique({ where: { id: product.id } });
    expect(unchanged?.stock).toBe(10);              // NOT 5

    // And no order was created.
    const orderCount = await prisma.order.count();
    expect(orderCount).toBe(0);
  });

  test("insufficient stock is rejected", async () => {
    const { token } = await createUserAndToken({
      email: "buyer3@example.test",
      role: "CUSTOMER",
    });
    const product = await createProduct("Limited", 2);

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [{ productId: product.id, quantity: 100 }] });

    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain("Insufficient stock");

    // Stock unchanged
    const unchanged = await prisma.product.findUnique({ where: { id: product.id } });
    expect(unchanged?.stock).toBe(2);
  });

  test("customers cannot view other customers' orders (404, not 403)", async () => {
    const alice = await createUserAndToken({ email: "alice@example.test", role: "CUSTOMER" });
    const bob   = await createUserAndToken({ email: "bob@example.test",   role: "CUSTOMER" });
    const product = await createProduct("Shared", 100);

    const orderRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${alice.token}`)
      .send({ items: [{ productId: product.id, quantity: 1 }] });

    const orderId = orderRes.body.order.id;

    // Bob tries to view Alice's order
    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set("Authorization", `Bearer ${bob.token}`);

    expect(res.status).toBe(404);                  // 404, not 403
  });

  test("admins can view any order", async () => {
    const customer = await createUserAndToken({ email: "c@example.test", role: "CUSTOMER" });
    const admin    = await createUserAndToken({ email: "a@example.test", role: "ADMIN" });
    const product = await createProduct("Any", 100);

    const orderRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${customer.token}`)
      .send({ items: [{ productId: product.id, quantity: 1 }] });

    const orderId = orderRes.body.order.id;

    const res = await request(app)
      .get(`/api/orders/${orderId}`)
      .set("Authorization", `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.order.id).toBe(orderId);
  });

  test("POST /api/orders without token returns 401", async () => {
    const res = await request(app)
      .post("/api/orders")
      .send({ items: [{ productId: 1, quantity: 1 }] });

    expect(res.status).toBe(401);
  });

  test("empty items array returns 400", async () => {
    const { token } = await createUserAndToken({
      email: "empty@example.test",
      role: "CUSTOMER",
    });

    const res = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${token}`)
      .send({ items: [] });

    expect(res.status).toBe(400);
  });
});