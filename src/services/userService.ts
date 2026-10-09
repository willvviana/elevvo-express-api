// src/services/userService.ts

import type {
  UserRecord,
  CreateUserInput,
  UpdateUserInput,
} from "../types/domain.js";
import * as store from "../lib/store.js";
import { hashPassword } from "../lib/hash.js";

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

export async function listUsers(): Promise<UserRecord[]> {
  return store.findAllUsers();
}

export async function getUser(id: number): Promise<UserRecord> {
  const user = await store.findUserById(id);
  if (!user) throw new NotFoundError(id);
  return user;
}

/* ---------------- Write ---------------- */

export async function createUser(input: CreateUserInput): Promise<UserRecord> {
  validateInput(input);

  // Check for duplicate email — DB has a unique constraint, but we
  // want a friendly 400 rather than a raw P2002 error.
  const existing = await store.findUserByEmail(input.email);
  if (existing) {
    throw new ValidationError("Email already registered");
  }

  const passwordHash = await hashPassword(input.password);

  return store.createUser({
    name: input.name,
    email: input.email,
    role: input.role,
    passwordHash,
  });
}

export async function updateUser(
  id: number,
  input: UpdateUserInput,
): Promise<UserRecord> {
  const existing = await store.findUserById(id);
  if (!existing) throw new NotFoundError(id);

  if (input.name !== undefined && input.name.trim().length === 0) {
    throw new ValidationError("name cannot be empty");
  }
  if (input.email !== undefined && !isValidEmail(input.email)) {
    throw new ValidationError("email is invalid");
  }

  // If email is changing, check uniqueness.
  if (input.email !== undefined && input.email.toLowerCase() !== existing.email) {
    const conflict = await store.findUserByEmail(input.email);
    if (conflict) throw new ValidationError("Email already registered");
  }

  const updated = await store.updateUser(id, {
    ...(input.name !== undefined ? { name: input.name } : {}),
    ...(input.email !== undefined ? { email: input.email.toLowerCase() } : {}),
    ...(input.role !== undefined ? { role: input.role } : {}),
  });

  if (!updated) throw new Error("Store returned null after successful lookup");
  return updated;
}

export async function deleteUser(id: number): Promise<void> {
  const removed = await store.deleteUser(id);
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
  if (input.role !== "ADMIN" && input.role !== "CUSTOMER") {
    throw new ValidationError("role must be ADMIN or CUSTOMER");
  }
  if (!input.password || input.password.length < 8) {
    throw new ValidationError("password must be at least 8 characters");
  }
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}