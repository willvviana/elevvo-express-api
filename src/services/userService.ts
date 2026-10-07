// src/services/userService.ts

import type {
  UserRecord,
  CreateUserInput,
  UpdateUserInput,
} from "../types/domain.js";
import * as store from "../lib/store.js";
import { hashPassword } from "../lib/hash.js";

/**
 * Business logic layer. No HTTP. No req/res. Pure data operations.
 *
 * CHANGE FROM TASK 3:
 * - `createUser` now accepts a plaintext password and hashes it before storage.
 * - Returns `UserRecord` (with hash). Controllers strip the hash via `toPublicUser`.
 */

export class NotFoundError extends Error {
  constructor(public readonly id: number) {
    super(`User ${id} not found`);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/* ---------------- Read ---------------- */

export function listUsers(): readonly UserRecord[] {
  return store.findAll();
}

export function getUser(id: number): UserRecord {
  const user = store.findById(id);
  if (!user) throw new NotFoundError(id);
  return user;
}

/* ---------------- Write ---------------- */

/**
 * Create a user. Hashes the password before storing.
 * Async because bcrypt is async — it's CPU-bound work offloaded
 * to a worker thread by the bcrypt library.
 */
export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  validateInput(input);

  // Reject duplicate emails. Signup also checks this, but this
  // endpoint is a separate path — defense in depth.
  if (store.findByEmail(input.email)) {
    throw new ValidationError("Email already registered");
  }

  const passwordHash = await hashPassword(input.password);

  return store.create({
    name: input.name,
    email: input.email,
    role: input.role,
    passwordHash,
  });
}

export function updateUser(id: number, input: UpdateUserInput): UserRecord {
  const existing = store.findById(id);
  if (!existing) throw new NotFoundError(id);

  if (input.name !== undefined && input.name.trim().length === 0) {
    throw new ValidationError("name cannot be empty");
  }
  if (input.email !== undefined && !isValidEmail(input.email)) {
    throw new ValidationError("email is invalid");
  }

  // Note: password is intentionally NOT updatable via this endpoint.
  // Password changes go through a dedicated flow (verify old, set new).
  const patch: Partial<Omit<UserRecord, "id">> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.email !== undefined) patch.email = input.email;
  if (input.role !== undefined) patch.role = input.role;

  const updated = store.update(id, patch);
  if (!updated) throw new Error("Store returned null after successful lookup");
  return updated;
}

export function deleteUser(id: number): void {
  const removed = store.remove(id);
  if (!removed) throw new NotFoundError(id);
}

/* ---------------- Helpers ---------------- */

function validateInput(input: CreateUserInput): void {
  if (!input.name || input.name.trim().length === 0) {
    throw new ValidationError("name is required");
  }
  if (!input.email || !isValidEmail(input.email)) {
    throw new ValidationError("a valid email is required");
  }
  if (input.role !== "ADMIN" && input.role !== "USER") {
    throw new ValidationError("role must be ADMIN or USER");
  }
  if (!input.password || input.password.length < 8) {
    throw new ValidationError("password must be at least 8 characters");
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}