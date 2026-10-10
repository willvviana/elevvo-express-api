// src/controllers/productController.ts

import type { Request, Response } from "express";
import * as productService from "../services/productService.js";
import { NotFoundError, ValidationError } from "../services/userService.js";
import { cacheGet, cacheSet, cacheDelPattern } from "../lib/redis.js";

/**
 * Cache key conventions.
 *
 * - Prefix by resource ("products") and shape ("list" vs "detail").
 * - Include the query params that affect the response. Same params →
 *   same key → same cached payload.
 * - The "v1" suffix lets us invalidate everything by bumping to "v2"
 *   if the response shape ever changes. Old keys expire out naturally.
 */
const LIST_KEY_PREFIX = "products:list:v1:";
const DETAIL_KEY_PREFIX = "products:detail:v1:";

/** TTL from the brief: 1 hour. */
const TTL_SECONDS = 60 * 60;

function listCacheKey(params: {
  page: number;
  perPage: number;
  category?: string;
}): string {
  // Deterministic string. Same inputs always produce the same key.
  return `${LIST_KEY_PREFIX}page=${params.page}:perPage=${params.perPage}:category=${params.category ?? "_"}`;
}

function detailCacheKey(id: number): string {
  return `${DETAIL_KEY_PREFIX}${id}`;
}

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
  // FK constraint on delete — surfaced as a 409 by the service layer.
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
 * Invalidate every cached product response.
 *
 * Called after any write to the products table. Simplest correct
 * strategy: nuke everything under products:*. A smarter version would
 * target only the affected keys, but "delete all" is safe and cheap
 * at this scale. When we add high-traffic production data, we'd move
 * to keyed invalidation.
 *
 * This is the CACHE INVALIDATION BONUS from the brief.
 */
async function invalidateProductCache(): Promise<void> {
  await cacheDelPattern(`${LIST_KEY_PREFIX}*`);
  await cacheDelPattern(`${DETAIL_KEY_PREFIX}*`);
}

/* ---------------- Handlers ---------------- */

/**
 * GET /api/products?page=1&perPage=10&category=Electronics
 *
 * CACHE-ASIDE PATTERN:
 *   1. Build a deterministic key from the query params.
 *   2. Redis GET. On HIT, return immediately with X-Cache: HIT.
 *   3. On MISS, query Postgres, SET with TTL, return with X-Cache: MISS.
 *
 * The X-Cache header is not required by the brief, but it makes the
 * cache behavior observable in curl and in logs — which is what you
 * need when debugging "why is this fast/slow?" questions.
 */
export async function listProducts(req: Request, res: Response): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const perPage = Number(req.query.perPage) || 10;
    const category = typeof req.query.category === "string" ? req.query.category : undefined;

    const key = listCacheKey({
      page,
      perPage,
      ...(category !== undefined ? { category } : {}),
    });

    // 1. Cache first.
    const cached = await cacheGet<unknown>(key);
    if (cached !== null) {
      res.setHeader("X-Cache", "HIT");
      res.status(200).json(cached);
      return;
    }

    // 2. Miss — go to the source of truth.
    const result = await productService.listProducts({
      page,
      perPage,
      ...(category !== undefined ? { category } : {}),
    });

    // 3. Populate the cache for next time.
    await cacheSet(key, result, TTL_SECONDS);

    res.setHeader("X-Cache", "MISS");
    res.status(200).json(result);
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * GET /api/products/:id — cached the same way as the list.
 *
 * Detail and list use different prefixes so we can invalidate them
 * independently if we ever need to (e.g., a list-only invalidation).
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
    const key = detailCacheKey(id);

    const cached = await cacheGet<unknown>(key);
    if (cached !== null) {
      res.setHeader("X-Cache", "HIT");
      res.status(200).json(cached);
      return;
    }

    const product = await productService.getProduct(id);
    const payload = { product };
    await cacheSet(key, payload, TTL_SECONDS);

    res.setHeader("X-Cache", "MISS");
    res.status(200).json(payload);
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * POST /api/products — invalidates cache on success.
 *
 * Every write path must invalidate. If create doesn't, the next
 * `GET /api/products` returns a list missing the new product — the
 * user sees "success" but the new item isn't there.
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

    const product = await productService.createProduct(body as {
      name: string;
      description: string;
      price: number;
      stock: number;
      category: string;
      imageUrl?: string | null;
    });

    await invalidateProductCache();

    res.status(201).json({ product });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * PUT /api/products/:id — invalidates cache on success.
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

    await invalidateProductCache();

    res.status(200).json({ product });
  } catch (err) {
    handleError(res, err);
  }
}

/**
 * DELETE /api/products/:id — invalidates cache on success.
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
    await invalidateProductCache();
    res.status(204).send();
  } catch (err) {
    handleError(res, err);
  }
}
