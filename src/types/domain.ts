// src/types/domain.ts

/**
 * Roles in the system.
 * Uppercase to match typical JWT convention. Task 3 used lowercase.
 */
export type Role = "USER" | "ADMIN";

/**
 * Internal user record. Includes the hashed password.
 * NEVER send this object to a client.
 */
export interface UserRecord {
  readonly id: number;
  readonly name: string;
  readonly email: string;
  readonly role: Role;
  readonly passwordHash: string;   // bcrypt hash — never plain text
}

/**
 * Public user. What we send to clients.
 * Same as UserRecord but without the passwordHash.
 */
export type PublicUser = Omit<UserRecord, "passwordHash">;

/**
 * Strip the hash before sending to a client.
 * One function, used everywhere. Never leak a hash by accident.
 */
export function toPublicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
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

/**
 * JWT payload. Keep it minimal — it's readable by anyone.
 * Only include what the middleware needs to authorize requests.
 */
export interface JwtPayload {
  readonly sub: number;        // subject = user id (JWT convention)
  readonly email: string;
  readonly role: Role;
}