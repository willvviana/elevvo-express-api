// src/middleware/observability.ts

import type { Request, Response, NextFunction } from "express";

/**
 * Observability middleware.
 *
 * Logs every incoming request with:
 * - ISO timestamp (when the request arrived)
 * - HTTP method
 * - URL path
 * - Response status code
 * - Processing duration in milliseconds
 *
 * HOW IT WORKS:
 * Express calls this function BEFORE the route handler runs.
 * `res.on("finish", ...)` registers a listener that fires AFTER
 * the response has been fully sent. That's where we can compute
 * the total duration and know the final status code.
 *
 * WHY IT MATTERS:
 * This is the minimum bar for a production API. Without it, you have
 * no visibility into what's happening. When something is slow, you
 * can't tell which route, which client, which method.
 */
export function observability(req: Request, res: Response, next: NextFunction): void {
  const startMs = Date.now();
  const arrivedAt = new Date().toISOString();

  // Attach a listener for when the response finishes.
  // "finish" fires when the last byte has been handed to the OS.
  // "close" would also fire on client disconnect — we use "finish" here.
  res.on("finish", () => {
    const durationMs = Date.now() - startMs;
    const status = res.statusCode;

    // Single-line log. Parseable. Scannable in a terminal.
    // Format: [ISO] METHOD PATH → STATUS (Xms)
    console.log(
      `[${arrivedAt}] ${req.method} ${req.originalUrl} → ${status} (${durationMs}ms)`,
    );
  });

  // Call next() to pass control to the next middleware or route.
  // WITHOUT THIS, the request hangs forever. This is the #1 Express mistake.
  next();
}