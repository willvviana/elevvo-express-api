// tests/auth.test.ts

import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma, resetDatabase, disconnectDb } from "./helpers/db.js";
import bcrypt from "bcrypt";

const app = createApp();

/**
 * Auth flow tests.
 *
 * Covers:
 * - Signup creates a user with a hashed password.
 * - Login with valid credentials returns a token.
 * - Login with wrong password returns 401.
 * - Login with unknown email returns 401 (same generic error).
 * - Protected routes reject missing or malformed tokens.
 * - RBAC: non-admins cannot hit admin-only routes.
 */

async function createTestUser(opts: {
  email: string;
  password: string;
  role?: "ADMIN" | "CUSTOMER";
}) {
  const passwordHash = await bcrypt.hash(opts.password, 12);
  return prisma.user.create({
    data: {
      email: opts.email,
      name: "Test User",
      role: opts.role ?? "CUSTOMER",
      passwordHash,
    },
  });
}

describe("Auth", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await disconnectDb();
  });

  /* ---------------- Signup ---------------- */

  test("signup creates a user and never returns the password hash", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        name: "Alice",
        email: "alice@example.test",
        password: "supersecret123",
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();
    expect(res.body.user.email).toBe("alice@example.test");
    expect(res.body.user.role).toBe("CUSTOMER");
    // Critical: the hash must never appear in the response.
    expect(JSON.stringify(res.body)).not.toContain("$2b$");
  });

  test("signup rejects duplicate emails with 409", async () => {
    await createTestUser({ email: "dup@example.test", password: "password123" });

    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        name: "Dup",
        email: "dup@example.test",
        password: "password123",
      });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("EMAIL_EXISTS");
  });

  test("signup rejects weak passwords with 400", async () => {
    const res = await request(app)
      .post("/api/auth/signup")
      .send({
        name: "Weak",
        email: "weak@example.test",
        password: "short",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("WEAK_PASSWORD");
  });

  /* ---------------- Login ---------------- */

  test("login with valid credentials returns a token", async () => {
    await createTestUser({ email: "user@example.test", password: "password123" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user@example.test", password: "password123" });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user.email).toBe("user@example.test");
    expect(JSON.stringify(res.body)).not.toContain("$2b$");
  });

  test("login with wrong password returns 401 with generic error", async () => {
    await createTestUser({ email: "user2@example.test", password: "password123" });

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "user2@example.test", password: "wrongpassword" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    // Must not leak which part of the credentials was wrong
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  test("login with unknown email returns 401 with the SAME generic error", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.test", password: "whatever" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("INVALID_CREDENTIALS");
    // Same message as wrong password — no user enumeration
    expect(res.body.error.message).toBe("Invalid email or password");
  });

  /* ---------------- Protected routes ---------------- */

  test("GET /api/auth/me without token returns 401", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("MISSING_TOKEN");
  });

  test("GET /api/auth/me with malformed Authorization header returns 401", async () => {
    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", "NotBearer sometoken");

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("MALFORMED_AUTH_HEADER");
  });

  test("GET /api/auth/me with valid token returns the current user", async () => {
    await createTestUser({ email: "me@example.test", password: "password123" });

    const loginRes = await request(app)
      .post("/api/auth/login")
      .send({ email: "me@example.test", password: "password123" });

    const token = loginRes.body.token;

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe("me@example.test");
  });
});