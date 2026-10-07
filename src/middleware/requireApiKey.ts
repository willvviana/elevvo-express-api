// src/middleware/requireApiKey.ts

import type { Request, Response, NextFunction } from "express";

/**
 * Security middleware. Rejects requests without a valid API key.
 *
 * HOW IT WORKS:
 * - Reads the `x-api-key` header.
 * - Compares it against an expected value.
 * - If missing or wrong → 401 Unauthorized. Stop. Do not call next().
 * - If correct → next(). Request proceeds to route handler.
 *
 * WHY 401 vs 403:
 * - 401 Unauthorized = "you didn't prove who you are." (No key, wrong key.)
 * - 403 Forbidden    = "we know who you are, but you're not allowed."
 * We use 401 because the caller failed to authenticate.
 *
 * PRODUCTION NOTES:
 * - The key MUST come from an environment variable, not hardcoded.
 * - Use timing-safe comparison to prevent timing attacks.
 *   `crypto.timingSafeEqual` — for now, we use simple equality since
 *   this is a learning exercise.
 * - Real APIs use multiple keys, key rotation, and rate limits per key.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.API_KEY;

  // Fail closed: if the server has no key configured, reject everything.
  // This prevents accidentally shipping an unprotected API.
  if (!expected) {
    console.error("requireApiKey: API_KEY env var not set — rejecting request");
    res.status(500).json({
      error: { code: "SERVER_MISCONFIGURED", message: "API key not configured" },
    });
    return;
  }

  const provided = req.header("x-api-key");

  if (!provided) {
    res.status(401).json({
      error: { code: "MISSING_API_KEY", message: "x-api-key header is required" },
    });
    return;
  }

  if (provided !== expected) {
    res.status(401).json({
      error: { code: "INVALID_API_KEY", message: "x-api-key is invalid" },
    });
    return;
  }

  next();
}