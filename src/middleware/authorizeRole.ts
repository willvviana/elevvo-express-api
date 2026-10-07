// src/middleware/authorizeRole.ts

import type { Request, Response, NextFunction } from "express";
import type { Role } from "../types/domain.js";

/**
 * Role-Based Access Control middleware factory.
 *
 * Usage:
 *   router.get("/admin-only", authenticateToken, authorizeRole("ADMIN"), handler)
 *   router.get("/any-logged-in", authenticateToken, handler)
 *   router.get("/staff-only", authenticateToken, authorizeRole("ADMIN", "USER"), handler)
 *
 * IMPORTANT: this middleware MUST run AFTER authenticateToken.
 * It relies on `req.user` being set. If authenticateToken isn't in the
 * chain first, req.user is undefined and this middleware will reject
 * with 401 — which is safe, but means you'd get a confusing error.
 *
 * WHY A FACTORY FUNCTION:
 * Express middleware is `(req, res, next) => void`.
 * We need to configure WHICH roles are allowed per route.
 * So authorizeRole("ADMIN") RETURNS a middleware — it doesn't BE one.
 * This is the standard pattern for parameterized middleware.
 */
export function authorizeRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Defensive check: if authenticateToken didn't run, reject.
    // 401 (not 403) because the client isn't authenticated at all.
    if (!req.user) {
      res.status(401).json({
        error: {
          code: "NOT_AUTHENTICATED",
          message: "This route requires authentication",
        },
      });
      return;
    }

    // The role comes from the VERIFIED JWT — never from the request body.
    // The token is signed, so we trust this value. A body-supplied role
    // would be spoofable.
    if (!allowedRoles.includes(req.user.role)) {
      // 403 = "we know who you are, you're just not allowed."
      // Contrast with 401 = "you haven't identified yourself."
      res.status(403).json({
        error: {
          code: "FORBIDDEN",
          message: `This action requires one of: ${allowedRoles.join(", ")}`,
        },
      });
      return;
    }

    next();
  };
}