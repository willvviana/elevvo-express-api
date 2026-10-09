// src/controllers/orderController.ts

import type { Request, Response } from "express";
import * as orderService from "../services/orderService.js";
import { NotFoundError, ValidationError } from "../services/userService.js";

function parseId(raw: unknown): number | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
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

/**
 * POST /api/orders
 * Body: { items: [{ productId, quantity }, ...] }
 *
 * Requires authentication. The userId comes from the JWT (`req.user.sub`),
 * NEVER from the request body.
 */
export async function createOrder(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      error: { code: "NOT_AUTHENTICATED", message: "Authentication required" },
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

    const input = body as { items: { productId: number; quantity: number }[] };
    const order = await orderService.placeOrder(req.user.sub, input);

    res.status(201).json({ order });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * GET /api/orders
 * Lists the authenticated user's orders. Paginated.
 */
export async function listMyOrders(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      error: { code: "NOT_AUTHENTICATED", message: "Authentication required" },
    });
    return;
  }

  try {
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.perPage) || 10;

    const result = await orderService.listMyOrders(req.user.sub, page, perPage);
    res.status(200).json(result);
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * GET /api/orders/:id
 * Retrieves a single order. Ownership is enforced in the service.
 */
export async function getOrder(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    res.status(401).json({
      error: { code: "NOT_AUTHENTICATED", message: "Authentication required" },
    });
    return;
  }

  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({
      error: { code: "INVALID_ID", message: "id must be a positive integer" },
    });
    return;
  }

  try {
    const order = await orderService.getOrder(id, req.user.sub, req.user.role);
    res.status(200).json({ order });
  } catch (err) {
    handleError(res, err);
  }
}