// src/controllers/productController.ts

import type { Request, Response } from "express";
import * as productService from "../services/productService.js";
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
  // Generic Error thrown by store — e.g. FK constraint on delete
  if (err instanceof Error && err.message.includes("referenced by")) {
    res.status(409).json({ error: { code: "CONFLICT", message: err.message } });
    return;
  }
  console.error("Unhandled controller error:", err);
  res.status(500).json({
    error: { code: "INTERNAL_ERROR", message: "Internal server error" },
  });
}

/**
 * GET /api/products?page=1&perPage=10&category=Electronics
 * Public route — no auth required.
 */
export async function listProducts(req: Request, res: Response): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.perPage) || 10;
    const category = typeof req.query.category === "string" ? req.query.category : undefined;

    const result = await productService.listProducts({
      page,
      perPage,
      ...(category !== undefined ? { category } : {}),
    });

    res.status(200).json(result);
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * GET /api/products/:id
 */
export async function getProduct(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({
      error: { code: "INVALID_ID", message: "id must be a positive integer" },
    });
    return;
  }

  try {
    const product = await productService.getProduct(id);
    res.status(200).json({ product });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * POST /api/products — ADMIN only (enforced at route level).
 */
export async function createProduct(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as unknown;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      res.status(400).json({
        error: { code: "INVALID_BODY", message: "Request body must be a JSON object" },
      });
      return;
    }
    const input = body as {
      name: string;
      description: string;
      price: number;
      stock: number;
      category: string;
      imageUrl?: string | null;
    };
    const product = await productService.createProduct(input);
    res.status(201).json({ product });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * PUT /api/products/:id — ADMIN only.
 */
export async function updateProduct(req: Request, res: Response): Promise<void> {
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
    const product = await productService.updateProduct(id, body as Partial<{
      name: string;
      description: string;
      price: number;
      stock: number;
      category: string;
      imageUrl: string | null;
    }>);
    res.status(200).json({ product });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * DELETE /api/products/:id — ADMIN only.
 */
export async function deleteProduct(req: Request, res: Response): Promise<void> {
  const id = parseId(req.params.id);
  if (id === null) {
    res.status(400).json({
      error: { code: "INVALID_ID", message: "id must be a positive integer" },
    });
    return;
  }

  try {
    await productService.deleteProduct(id);
    res.status(204).send();
  } catch (err) {
    handleError(res, err);
  }
}