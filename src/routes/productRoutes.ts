// src/routes/productRoutes.ts

import { Router } from "express";
import * as controller from "../controllers/productController.js";
import { authenticateToken } from "../middleware/authenticateToken.js";
import { authorizeRole } from "../middleware/authorizeRole.js";

export const productRouter = Router();

/* ============================================================
   PUBLIC ROUTES — no auth required
   ============================================================ */

// GET /api/products — anyone can browse the catalog
productRouter.get("/", controller.listProducts);

// GET /api/products/:id — anyone can view a product
productRouter.get("/:id", controller.getProduct);

/* ============================================================
   ADMIN ROUTES — require auth + ADMIN role
   ============================================================ */

// POST /api/products
productRouter.post(
  "/",
  authenticateToken,
  authorizeRole("ADMIN"),
  controller.createProduct,
);

// PUT /api/products/:id
productRouter.put(
  "/:id",
  authenticateToken,
  authorizeRole("ADMIN"),
  controller.updateProduct,
);

// DELETE /api/products/:id
productRouter.delete(
  "/:id",
  authenticateToken,
  authorizeRole("ADMIN"),
  controller.deleteProduct,
);