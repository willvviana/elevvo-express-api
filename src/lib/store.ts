// src/lib/store.ts

import type { User } from "../types/domain.js";

/**
 * In-memory user store.
 *
 * Why a module-scoped Map instead of a global array:
 * - Encapsulation. Nothing outside this file can mutate the data.
 * - All access goes through the exported functions.
 * - When we migrate to a database later, only this file changes.
 *
 * Resets every time the server restarts. That's expected for now.
 */

const users = new Map<number, User>();

/**
 * Seed data. Runs once at module load.
 * Gives us something to read on first request.
 */
function seed(): void {
  const initial: readonly User[] = [
    { id: 1, name: "Will Viana",  email: "will@elevvo.dev",  role: "admin"  },
    { id: 2, name: "Maya Rivera", email: "maya@elevvo.dev",  role: "editor" },
    { id: 3, name: "Sam Okafor",  email: "sam@elevvo.dev",   role: "viewer" },
  ];
  for (const user of initial) {
    users.set(user.id, user);
  }
}
seed();

/** Auto-increment counter for new IDs. */
let nextId = 4;

/* ---------------- Read operations ---------------- */

export function findAll(): readonly User[] {
  return [...users.values()];
}

export function findById(id: number): User | null {
  return users.get(id) ?? null;
}

/* ---------------- Write operations ---------------- */

export function create(input: Omit<User, "id">): User {
  const user: User = { id: nextId++, ...input };
  users.set(user.id, user);
  return user;
}

export function update(id: number, patch: Partial<Omit<User, "id">>): User | null {
  const existing = users.get(id);
  if (!existing) return null;

  // Merge patch over existing. Immutable — create new object, don't mutate.
  const updated: User = { ...existing, ...patch };
  users.set(id, updated);
  return updated;
}

export function remove(id: number): boolean {
  return users.delete(id);
}