// src/services/userService.ts

import type { User, CreateUserInput, UpdateUserInput } from "../types/domain.js";
import * as store from "../lib/store.js";

/**
 * Service layer. All business logic lives here.
 *
 * Rules:
 * - Never touches `req` or `res`. This layer doesn't know HTTP exists.
 * - Throws typed errors. Controllers decide the HTTP status code.
 * - Everything is a pure function over input → output.
 *
 * Why this separation:
 * - Testable: you can call `userService.findAll()` in a unit test with no HTTP.
 * - Reusable: the same service could back a CLI, a GraphQL resolver, or a cron job.
 */

/**
 * Custom error class. Controllers check `instanceof NotFoundError`
 * to decide whether to send a 404. Without this, they'd have to
 * parse error message strings — fragile and ugly.
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

export function listUsers(): readonly User[] {
  return store.findAll();
}

export function getUser(id: number): User {
  const user = store.findById(id);
  if (!user) throw new NotFoundError(id);
  return user;
}

/* ---------------- Write ---------------- */

export function createUser(input: CreateUserInput): User {
  validateInput(input);
  return store.create(input);
}

export function updateUser(id: number, input: UpdateUserInput): User {
  // Verify existence first — better error than "update returned null".
  const existing = store.findById(id);
  if (!existing) throw new NotFoundError(id);

  if (input.name !== undefined && input.name.trim().length === 0) {
    throw new ValidationError("name cannot be empty");
  }
  if (input.email !== undefined && !isValidEmail(input.email)) {
    throw new ValidationError("email is invalid");
  }

  const updated = store.update(id, input);
  // We already checked existence, so this should never be null.
  // Throw if it is — that would mean a bug in the store layer.
  if (!updated) throw new Error("Store returned null after successful lookup");
  return updated;
}

export function deleteUser(id: number): void {
  const removed = store.remove(id);
  if (!removed) throw new NotFoundError(id);
}

/* ---------------- Helpers ---------------- */

/**
 * Validate a create payload. Throws ValidationError if anything's wrong.
 * Deliberately simple — real validation belongs in a schema library
 * (zod, yup). Task 4 probably introduces that.
 */
function validateInput(input: CreateUserInput): void {
  if (!input.name || input.name.trim().length === 0) {
    throw new ValidationError("name is required");
  }
  if (!input.email || !isValidEmail(input.email)) {
    throw new ValidationError("a valid email is required");
  }
  if (!["admin", "editor", "viewer"].includes(input.role)) {
    throw new ValidationError("role must be admin, editor, or viewer");
  }
}

function isValidEmail(email: string): boolean {
  // Same intentionally-loose regex from the frontend tasks.
  // Real validation = send a confirmation email.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}