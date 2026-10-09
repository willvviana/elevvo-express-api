// src/types/domain.ts

/**
 * Domain types.
 *
 * ROLE CHANGE FROM TASK 4: "USER" → "CUSTOMER".
 * Aligns with the Prisma enum and matches e-commerce semantics.
 */

export type Role = "ADMIN" | "CUSTOMER";

export type OrderStatus =
  | "PENDING"
  | "PAID"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";

/**
 * User as stored in the database.
 * Timestamps are Date objects — Prisma returns them that way.
 * NEVER send this object to a client (passwordHash leaks).
 */
export interface UserRecord {
  readonly id: number;
  readonly email: string;
  readonly name: string;
  readonly role: Role;
  readonly passwordHash: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Public user. What we send to clients. No hash, no internal timestamps.
 */
export interface PublicUser {
  readonly id: number;
  readonly email: string;
  readonly name: string;
  readonly role: Role;
}

export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
  };
}

export interface CreateUserInput {
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  readonly password: string;
}

export type UpdateUserInput = Partial<Omit<CreateUserInput, "password">>;

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export interface JwtPayload {
  readonly sub: number;
  readonly email: string;
  readonly role: Role;
}