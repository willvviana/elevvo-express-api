// src/routes/orderRoutes.ts

import { Router } from "express";
import * as controller from "../controllers/orderController.js";
import { authenticateToken } from "../middleware/authenticateToken.js";

export const orderRouter = Router();

/**
 * ALL order routes require authentication.
 *
 * `router.use(authenticateToken)` applies the middleware to every
 * route registered below it. Cleaner than adding it to each route.
 */
orderRouter.use(authenticateToken);

// POST /api/orders — create an order
orderRouter.post("/", controller.createOrder);

// GET /api/orders — list the current user's orders
orderRouter.get("/", controller.listMyOrders);

// GET /api/orders/:id — get one order (ownership enforced in service)
orderRouter.get("/:id", controller.getOrder);