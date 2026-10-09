// src/services/productService.ts

import type { Product } from "@prisma/client";
import * as store from "../lib/store.js";
import { NotFoundError, ValidationError } from "./userService.js";

/**
 * Product service. Business logic for the catalog.
 *
 * Validation rules:
 * - name: 1+ chars
 * - description: 10+ chars (they'll be used as embeddings in Task 9)
 * - price: > 0
 * - stock: >= 0
 * - category: 1+ chars
 */

export interface ListProductsParams {
  page: number;
  perPage: number;
  category?: string;
}

export interface PaginatedProducts {
  products: Product[];
  total: number;
  page: number;
  perPage: number;
  totalPages: number;
}

export async function listProducts(
  params: ListProductsParams,
): Promise<PaginatedProducts> {
  const page = Math.max(1, params.page);
  const perPage = Math.min(100, Math.max(1, params.perPage)); // cap at 100
  const skip = (page - 1) * perPage;

  const { products, total } = await store.findAllProducts({
    skip,
    take: perPage,
    ...(params.category !== undefined ? { category: params.category } : {}),
  });

  return {
    products,
    total,
    page,
    perPage,
    totalPages: Math.ceil(total / perPage),
  };
}

export async function getProduct(id: number): Promise<Product> {
  const product = await store.findProductById(id);
  if (!product) throw new NotFoundError(id);
  return product;
}

export async function createProduct(input: {
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
  imageUrl?: string | null;
}): Promise<Product> {
  validateProductInput(input);
  return store.createProduct(input);
}

export async function updateProduct(
  id: number,
  input: Partial<{
    name: string;
    description: string;
    price: number;
    stock: number;
    category: string;
    imageUrl: string | null;
  }>,
): Promise<Product> {
  const existing = await store.findProductById(id);
  if (!existing) throw new NotFoundError(id);

  if (input.name !== undefined && input.name.trim().length === 0) {
    throw new ValidationError("name cannot be empty");
  }
  if (input.description !== undefined && input.description.trim().length < 10) {
    throw new ValidationError("description must be at least 10 characters");
  }
  if (input.price !== undefined && input.price <= 0) {
    throw new ValidationError("price must be greater than 0");
  }
  if (input.stock !== undefined && input.stock < 0) {
    throw new ValidationError("stock cannot be negative");
  }

  const updated = await store.updateProduct(id, input);
  if (!updated) throw new Error("Store returned null after successful lookup");
  return updated;
}

export async function deleteProduct(id: number): Promise<void> {
  const removed = await store.deleteProduct(id);
  if (!removed) throw new NotFoundError(id);
}

/* ---------------- Helpers ---------------- */

function validateProductInput(input: {
  name: string;
  description: string;
  price: number;
  stock: number;
  category: string;
}): void {
  if (!input.name || input.name.trim().length === 0) {
    throw new ValidationError("name is required");
  }
  if (!input.description || input.description.trim().length < 10) {
    throw new ValidationError("description must be at least 10 characters");
  }
  if (typeof input.price !== "number" || input.price <= 0) {
    throw new ValidationError("price must be a positive number");
  }
  if (typeof input.stock !== "number" || input.stock < 0 || !Number.isInteger(input.stock)) {
    throw new ValidationError("stock must be a non-negative integer");
  }
  if (!input.category || input.category.trim().length === 0) {
    throw new ValidationError("category is required");
  }
}