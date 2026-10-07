// src/routes/userRoutes.ts

import { Router } from "express";
import * as controller from "../controllers/userController.js";

/**
 * Routes layer.
 *
 * Responsibilities:
 * - Declare URL paths.
 * - Map each path + method to a controller function.
 *
 * What it does NOT do:
 * - Any logic. No parsing, no validation, no decisions.
 * - Any service calls. Controllers do that.
 *
 * Why a Router and not the app directly:
 * - Modular. This router can be mounted anywhere.
 * - Testable. You can test routes without spinning up the full server.
 * - Composable. In a bigger app, you'd have userRoutes, projectRoutes,
 *   authRoutes, and each lives in its own file.
 */
export const userRouter = Router();

// GET /api/users → list
userRouter.get("/", controller.listUsers);

// GET /api/users/:id → single
userRouter.get("/:id", controller.getUser);

// POST /api/users → create
userRouter.post("/", controller.createUser);

// PUT /api/users/:id → update
userRouter.put("/:id", controller.updateUser);

// DELETE /api/users/:id → remove
userRouter.delete("/:id", controller.deleteUser);