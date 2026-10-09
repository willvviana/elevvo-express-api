// src/services/authService.ts

import jwt from "jsonwebtoken";
import { env } from "../lib/env.js";
import { verifyPassword, hashPassword } from "../lib/hash.js";
import * as store from "../lib/store.js";
import type {
  UserRecord,
  LoginInput,
  JwtPayload,
  PublicUser,
  Role,
} from "../types/domain.js";
import { toPublicUser } from "../types/domain.js";

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly code: "INVALID_CREDENTIALS" | "EMAIL_EXISTS",
  ) {
    super(message);
    this.name = "AuthError";
  }
}

/**
 * Precomputed bcrypt hash used as a timing decoy when a user doesn't exist.
 * Ensures login takes similar time whether or not the email is registered.
 */
const DUMMY_HASH =
  "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewLt6fXf3YqX1qnG";

export async function login(
  input: LoginInput,
): Promise<{ token: string; user: PublicUser }> {
  const user = store.findByEmail(input.email);

  // Always run a bcrypt compare, even for missing users.
  // Timing attack mitigation.
  const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
  const passwordOk = await verifyPassword(input.password, hashToCheck);

  if (!user || !passwordOk) {
    throw new AuthError("Invalid email or password", "INVALID_CREDENTIALS");
  }

  const token = signToken(user);
  return { token, user: toPublicUser(user) };
}

function signToken(user: UserRecord): string {
  const payload: JwtPayload = {
    sub: user.id,
    email: user.email,
    role: user.role,
  };

  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN,
    algorithm: "HS256",
  });
}

export async function signup(input: {
  name: string;
  email: string;
  password: string;
  role?: Role;
}): Promise<PublicUser> {
  if (store.findByEmail(input.email)) {
    throw new AuthError("Email already registered", "EMAIL_EXISTS");
  }

  const passwordHash = await hashPassword(input.password);

  const record = store.create({
    name: input.name,
    email: input.email,
    role: input.role ?? "USER",
    passwordHash,
  });

  return toPublicUser(record);
}

export function verifyToken(token: string): JwtPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET, {
    algorithms: ["HS256"],
  });

  if (typeof decoded === "string") {
    throw new Error("Unexpected string payload from JWT");
  }

  if (
    typeof decoded["sub"] !== "number" ||
    typeof decoded["email"] !== "string" ||
    (decoded["role"] !== "USER" && decoded["role"] !== "ADMIN")
  ) {
    throw new Error("JWT payload is missing required claims");
  }

  return {
    sub: decoded["sub"],
    email: decoded["email"],
    role: decoded["role"],
  };
}