// src/lib/store.ts

import type { UserRecord, Role } from "../types/domain.js";

/**
 * In-memory user store.
 *
 * CHANGE FROM TASK 3:
 * - Now stores `UserRecord` (includes passwordHash) instead of `User`.
 * - Seeded users have pre-hashed passwords. See below.
 *
 * In a real app this file is replaced by database queries.
 * The service layer wouldn't change.
 */

const users = new Map<number, UserRecord>();

/**
 * Seed data.
 *
 * The password hashes below are for the plaintext "password123".
 * I pre-computed them so you don't wait ~300ms per user on startup
 * (bcrypt with cost 12 is deliberately slow).
 *
 * Do NOT copy these to production. Generate fresh hashes.
 *
 * To generate your own: run `npm run hash -- "yourpassword"` (see package.json).
 */
function seed(): void {
  const initial: readonly UserRecord[] = [
    {
      id: 1,
      name: "Will Viana",
      email: "will@elevvo.dev",
      role: "ADMIN",
      passwordHash: "$2b$12$MHGsRV/OtMvJwwVqyro24uFiFJhNYu82692e1CpkqnDfbNu/RQz1.",
    },
    {
      id: 2,
      name: "Maya Rivera",
      email: "maya@elevvo.dev",
      role: "USER",
      passwordHash: "$2b$12$MHGsRV/OtMvJwwVqyro24uFiFJhNYu82692e1CpkqnDfbNu/RQz1.",
    },
    {
      id: 3,
      name: "Sam Okafor",
      email: "sam@elevvo.dev",
      role: "USER",
      passwordHash: "$2b$12$MHGsRV/OtMvJwwVqyro24uFiFJhNYu82692e1CpkqnDfbNu/RQz1.",
    },
  ];
  for (const user of initial) {
    users.set(user.id, user);
  }
}
seed();

let nextId = 4;

/* ---------------- Read ---------------- */

export function findAll(): readonly UserRecord[] {
  return [...users.values()];
}

export function findById(id: number): UserRecord | null {
  return users.get(id) ?? null;
}

export function findByEmail(email: string): UserRecord | null {
  // Linear scan. Fine for 3 users; a real DB uses an indexed unique column.
  // Emails are stored lowercase for consistent lookup.
  const normalized = email.toLowerCase();
  for (const user of users.values()) {
    if (user.email.toLowerCase() === normalized) return user;
  }
  return null;
}

/* ---------------- Write ---------------- */

export function create(input: Omit<UserRecord, "id">): UserRecord {
  const user: UserRecord = { id: nextId++, ...input };
  users.set(user.id, user);
  return user;
}

export function update(
  id: number,
  patch: Partial<Omit<UserRecord, "id">>,
): UserRecord | null {
  const existing = users.get(id);
  if (!existing) return null;
  const updated: UserRecord = { ...existing, ...patch };
  users.set(id, updated);
  return updated;
}

export function remove(id: number): boolean {
  return users.delete(id);
}