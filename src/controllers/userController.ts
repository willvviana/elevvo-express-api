// src/controllers/userController.ts

import type { Request, Response } from "express";
import * as userService from "../services/userService.js";
import { NotFoundError, ValidationError } from "../services/userService.js";
import type { CreateUserInput, UpdateUserInput } from "../types/domain.js";

/**
 * Controller layer.
 *
 * Responsibilities:
 * - Parse `req.params`, `req.body`, `req.query` into typed values.
 * - Call the service.
 * - Send the HTTP response.
 * - Catch service errors and map them to status codes.
 *
 * What it does NOT do:
 * - Business logic. That's in the service.
 * - Data persistence. That's in the store.
 *
 * Why async/await everywhere: even though our store is synchronous,
 * a real database call will be async. Controllers should be written
 * as if the service is already async — migrating later is trivial.
 */

/* ---------------- Helpers ---------------- */

/**
 * Parse a route param as a number. Express gives us strings.
 * Returns null if invalid — caller decides how to respond.
 */
function parseId(raw: string | undefined): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Central error handler for a controller.
 * Maps service errors to HTTP status codes.
 *
 * Every controller catch block calls this. One place to change
 * error behavior for the whole API.
 */
function handleError(res: Response, err: unknown): void {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: err.message } });
    return;
  }
  if (err instanceof ValidationError) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
    return;
  }

  // Unknown error. Log it, but don't leak details to the client.
  console.error("Unhandled controller error:", err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  });
}

/* ---------------- Handlers ---------------- */

/**
 * GET /api/users
 * Returns the full list.
 */
export function listUsers(_req: Request, res: Response): void {
  try {
    const users = userService.listUsers();
    res.status(200).json({ users, count: users.length });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * GET /api/users/:id
 * Returns one user or 404.
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
    res.status(200).json({ user });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * POST /api/users
 * Body must be JSON with name, email, role.
 * Returns 201 Created with the new user.
 */
export function createUser(req: Request, res: Response): void {
  try {
    // Body shape is validated inside the service.
    // We trust req.body is an object because express.json() ran first —
    // but it could be any JSON: string, number, array. Guard for objects.
    const body = req.body as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      res.status(400).json({
        error: { code: "INVALID_BODY", message: "Request body must be a JSON object" },
      });
      return;
    }

    const input = body as CreateUserInput;
    const user = userService.createUser(input);
    res.status(201).json({ user });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * PUT /api/users/:id
 * Partial update. Omitted fields stay unchanged.
 */
export function updateUser(req: Request, res: Response): void {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({
      error: { code: "INVALID_ID", message: "id must be a positive integer" },
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
    res.status(200).json({ user });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * DELETE /api/users/:id
 * Returns 204 No Content on success (no body).
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
    // 204 means "success, nothing to say". No JSON body.
    res.status(204).send();
  } catch (err) {
    handleError(res, err);
  }
}