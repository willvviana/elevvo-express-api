// src/controllers/authController.ts

import type { Request, Response } from "express";
import * as authService from "../services/authService.js";
import { AuthError } from "../services/authService.js";
import type { LoginInput } from "../types/domain.js";

/**
 * Auth controller. Maps HTTP <-> service.
 */

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Returns: { token, user }
 */
export async function login(req: Request, res: Response): Promise<void> {
  const body = req.body as unknown;
  if (!isObject(body)) {
    res.status(400).json({
      error: { code: "INVALID_BODY", message: "Request body must be a JSON object" },
    });
    return;
  }

  const { email, password } = body as Partial<LoginInput>;

  // Basic shape validation. Missing fields → 400, not 401.
  // 401 is for "wrong credentials," 400 is for "malformed request."
  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({
      error: {
        code: "MISSING_FIELDS",
        message: "email and password are required and must be strings",
      },
    });
    return;
  }

  try {
    const result = await authService.login({ email, password });
    res.status(200).json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      // Same status and message for both "no such user" and "wrong password."
      // Do not differentiate — that leaks which emails exist.
      res.status(401).json({
        error: { code: "INVALID_CREDENTIALS", message: err.message },
      });
      return;
    }
    console.error("Login error:", err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  }
}

/**
 * POST /api/auth/signup
 * Body: { name, email, password, role? }
 * Returns: { user }
 *
 * In this demo, signup is OPEN. In production, you'd either:
 * - Require an admin token to create new accounts, or
 * - Send a verification email and only activate on confirmation.
 */
export async function signup(req: Request, res: Response): Promise<void> {
  const body = req.body as unknown;
  if (!isObject(body)) {
    res.status(400).json({
      error: { code: "INVALID_BODY", message: "Request body must be a JSON object" },
    });
    return;
  }

  const { name, email, password, role } = body as {
    name?: unknown;
    email?: unknown;
    password?: unknown;
    role?: unknown;
  };

  if (
    typeof name !== "string" ||
    typeof email !== "string" ||
    typeof password !== "string"
  ) {
    res.status(400).json({
      error: {
        code: "MISSING_FIELDS",
        message: "name, email, and password are required",
      },
    });
    return;
  }

  // Password strength check. bcrypt doesn't care about length,
  // but short passwords are crackable regardless of hashing.
  if (password.length < 8) {
    res.status(400).json({
      error: { code: "WEAK_PASSWORD", message: "Password must be at least 8 characters" },
    });
    return;
  }

  // Only allow role to be set by a new user if it's a valid value.
  // Never let a caller promote themselves without a check.
  // In this demo we allow both, but flag it in comments.
  const validRole = role === "ADMIN" || role === "CUSTOMER" ? role : "CUSTOMER";

  try {
    const user = await authService.signup({ name, email, password, role: validRole });
    res.status(201).json({ user });
  } catch (err) {
    if (err instanceof AuthError && err.code === "EMAIL_EXISTS") {
      res.status(409).json({
        error: { code: "EMAIL_EXISTS", message: err.message },
      });
      return;
    }
    console.error("Signup error:", err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  }
}

/**
 * GET /api/auth/me
 * Requires authenticateToken. Returns the current user's public profile.
 * Useful for clients to check "am I still logged in?"
 */
export function me(req: Request, res: Response): void {
  if (!req.user) {
    // Should never happen if authenticateToken ran, but defensive.
    res.status(401).json({
      error: { code: "NOT_AUTHENTICATED", message: "No authenticated user" },
    });
    return;
  }
  res.status(200).json({ user: req.user });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}