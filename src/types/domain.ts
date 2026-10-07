// src/types/domain.ts

/**
 * Domain model. Same idea as Task 2 — explicit types, no `any`.
 */

export interface User {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly role: "admin" | "editor" | "viewer";
}

/**
 * Payload for creating a user.
 * `id` is omitted — the server assigns it.
 */
export interface CreateUserInput {
  readonly name: string;
  readonly email: string;
  readonly role: "admin" | "editor" | "viewer";
}

/**
 * Payload for updating a user.
 * All fields optional — a partial update.
 */
export type UpdateUserInput = Partial<CreateUserInput>;