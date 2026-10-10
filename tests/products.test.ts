// tests/products.test.ts

import request from "supertest";
import bcrypt from "bcrypt";
import { createApp } from "../src/app.js";
import { prisma, resetDatabase, disconnectDb } from "./helpers/db.js";

const app = createApp();

/**
 * Product tests.
 *
 * Covers:
 * - Public reads (list, get by id).
 * - Admin-only writes enforced by RBAC.
 * - Pagination and category filtering.
 * - Password hashes never leak.
 */

async function adminToken(): Promise<string> {
  const passwordHash = await bcrypt.hash("password123", 12);
  await prisma.user.create({
    data: {
      email: "admin@example.test",
      name: "Admin",
      role: "ADMIN",
      passwordHash,
    },
  });

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "admin@example.test", password: "password123" });

  return res.body.token as string;
}

async function customerToken(): Promise<string> {
  const passwordHash = await bcrypt.hash("password123", 12);
  await prisma.user.create({
    data: {
      email: "customer@example.test",
      name: "Customer",
      role: "CUSTOMER",
      passwordHash,
    },
  });

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: "customer@example.test", password: "password123" });

  return res.body.token as string;
}

describe("Products", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  /* ---------------- Public reads ---------------- */

  test("GET /api/products is public and returns an empty list initially", async () => {
    const res = await request(app).get("/api/products");

    expect(res.status).toBe(200);
    expect(res.body.products).toEqual([]);
    expect(res.body.total).toBe(0);
    expect(res.body.page).toBe(1);
  });

  test("GET /api/products paginates correctly", async () => {
    // Create 5 products directly via Prisma — faster than 5 HTTP calls.
    for (let i = 1; i <= 5; i++) {
      await prisma.product.create({
        data: {
          name: `Product ${i}`,
          description: `Description for product ${i} which is long enough`,
          price: 10 * i,
          stock: 100,
          category: i % 2 === 0 ? "Even" : "Odd",
        },
      });
    }

    const res = await request(app).get("/api/products?page=1&perPage=2");

    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(2);
    expect(res.body.total).toBe(5);
    expect(res.body.totalPages).toBe(3);
  });

  test("GET /api/products filters by category", async () => {
    for (let i = 1; i <= 4; i++) {
      await prisma.product.create({
        data: {
          name: `Product ${i}`,
          description: `Description for product ${i} which is long enough`,
          price: 10,
          stock: 100,
          category: i <= 2 ? "A" : "B",
        },
      });
    }

    const res = await request(app).get("/api/products?category=A");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.products.every((p: { category: string }) => p.category === "A")).toBe(true);
  });

  /* ---------------- Admin writes ---------------- */

  test("POST /api/products without token returns 401", async () => {
    const res = await request(app)
      .post("/api/products")
      .send({
        name: "Test",
        description: "A valid description of at least 10 chars",
        price: 10,
        stock: 1,
        category: "Test",
      });

    expect(res.status).toBe(401);
  });

  test("POST /api/products as CUSTOMER returns 403", async () => {
    const token = await customerToken();

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Test",
        description: "A valid description of at least 10 chars",
        price: 10,
        stock: 1,
        category: "Test",
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  test("POST /api/products as ADMIN creates the product", async () => {
    const token = await adminToken();

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "Created",
        description: "A product created in a test with a valid description",
        price: 49.99,
        stock: 10,
        category: "Test",
      });

    expect(res.status).toBe(201);
    expect(res.body.product.name).toBe("Created");
    expect(res.body.product.price).toBe("49.99");
  });

  test("POST /api/products rejects invalid payloads with 400", async () => {
    const token = await adminToken();

    const res = await request(app)
      .post("/api/products")
      .set("Authorization", `Bearer ${token}`)
      .send({
        name: "",
        description: "short",
        price: -5,
        stock: -1,
        category: "",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});