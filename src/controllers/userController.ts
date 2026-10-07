// src/controllers/userController.ts

import type { Request, Response } from "express";
import * as userService from "../services/userService.js";
import { NotFoundError, ValidationError } from "../services/userService.js";
import { toPublicUser } from "../types/domain.js";
import type { CreateUserInput, UpdateUserInput } from "../types/domain.js";

/* ---------------- Helpers ---------------- */

function parseId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function handleError(res: Response, err: unknown): void {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: err.message } });
    return;
  }
  if (err instanceof ValidationError) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
    return;
  }
  console.error("Unhandled controller error:", err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  });
}

/* ---------------- Handlers ---------------- */

/**
 * GET /api/users
 * Requires: authenticated. Any role.
 * Hashes stripped via toPublicUser before sending.
 */
export function listUsers(_req: Request, res: Response): void {
  try {
    const users = userService.listUsers().map(toPublicUser);
    res.status(200).json({ users, count: users.length });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * GET /api/users/:id
 * Requires: authenticated. Any role.
 */
export function getUser(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({
      error: { code: "INVALID_ID", message: "id must be a positive integer" },
    });
    return;
  }

  try {
    const user = userService.getUser(id);
    res.status(200).json({ user: toPublicUser(user) });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * POST /api/users
 * Requires: ADMIN role (enforced at route level).
 * Hashes password before storage. Async because bcrypt is async.
 */
export async function createUser(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      res.status(400).json({
        error: { code: "INVALID_BODY", message: "Request body must be a JSON object" },
      });
      return;
    }

    const input = body as CreateUserInput;
    const user = await userService.createUser(input);
    res.status(201).json({ user: toPublicUser(user) });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * PUT /api/users/:id
 * Authorization: ADMIN can update anyone.
 *                Non-admins can only update themselves.
 *
 * The check depends on `req.user`, which the auth middleware sets.
 * It lives in the handler, not route-level middleware, because it
 * depends on the URL param matching the token subject.
 */
export function updateUser(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({
      error: { code: "INVALID_ID", message: "id must be a positive integer" },
    });
    return;
  }

  // Self-or-admin check.
  if (req.user && req.user.role !== "ADMIN" && req.user.sub !== id) {
    res.status(403).json({
      error: { code: "FORBIDDEN", message: "You can only update your own profile" },
    });
    return;
  }

  try {
    const body = req.body as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      res.status(400).json({
        error: { code: "INVALID_BODY", message: "Request body must be a JSON object" },
      });
      return;
    }

    const input = body as UpdateUserInput;
    const user = userService.updateUser(id, input);
    res.status(200).json({ user: toPublicUser(user) });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * DELETE /api/users/:id
 * Requires: ADMIN only (enforced at route level).
 */
export function deleteUser(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({
      error: { code: "INVALID_ID", message: "id must be a positive integer" },
    });
    return;
  }

  try {
    userService.deleteUser(id);
    res.status(204).send();
  } catch (err) {
    handleError(res, err);
  }
}