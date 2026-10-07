// src/middleware/authenticateToken.ts

import type { Request, Response, NextFunction } from "express";
import { verifyToken } from "../services/authService.js";
import type { JwtPayload } from "../types/domain.js";

/**
 * Extend Express's Request type to carry the authenticated user.
 *
 * Without this augmentation, TypeScript wouldn't know `req.user` exists.
 * Augmenting `Express.Request` is the standard pattern.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * authenticateToken middleware.
 *
 * Flow:
 * 1. Read `Authorization: Bearer <token>` header.
 * 2. If missing/malformed → 401, stop.
 * 3. Verify token signature and expiry.
 * 4. If invalid → 401, stop.
 * 5. If valid → attach payload to `req.user`, call next().
 *
 * DOWNSTREAM middleware and controllers can trust `req.user` completely,
 * because this middleware is the only thing that sets it.
 */
export function authenticateToken(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.header("authorization");

  if (!authHeader) {
    res.status(401).json({
      error: { code: "MISSING_TOKEN", message: "Authorization header is required" },
    });
    return;
  }

  // Standard format: "Bearer <token>"
  // Case-insensitive on "Bearer" per RFC 7235.
  const parts = authHeader.split(" ");
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== "bearer") {
    res.status(401).json({
      error: {
        code: "MALFORMED_AUTH_HEADER",
        message: "Authorization header must be: Bearer <token>",
      },
    });
    return;
  }

  const token = parts[1];
  if (!token) {
    res.status(401).json({
      error: { code: "MISSING_TOKEN", message: "Token is empty" },
    });
    return;
  }

  try {
    const payload = verifyToken(token);
    // Attach to request. Controllers and downstream middleware read from here.
    req.user = payload;
    next();
  } catch (err) {
    // Distinguish expired vs invalid for developer clarity.
    // Never leak internal error details beyond these two cases.
    const message = err instanceof Error ? err.message : "Invalid token";
    const code = message.includes("expired") ? "TOKEN_EXPIRED" : "INVALID_TOKEN";

    res.status(401).json({
      error: { code, message: message.includes("expired") ? "Token has expired" : "Token is invalid" },
    });
  }
}