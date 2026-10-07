// src/routes/userRoutes.ts

import { Router } from "express";
import * as controller from "../controllers/userController.js";
import { authenticateToken } from "../middleware/authenticateToken.js";
import { authorizeRole } from "../middleware/authorizeRole.js";

/**
 * User routes.
 *
 * Middleware order matters. Express runs them left-to-right.
 *
 * - authenticateToken: verifies the JWT and sets req.user.
 * - authorizeRole("ADMIN"): rejects non-admins. Must run AFTER
 *   authenticateToken, otherwise req.user is undefined.
 *
 * PUBLIC routes: none. Every user route requires authentication.
 */
export const userRouter = Router();

// All routes below require a valid JWT.
userRouter.use(authenticateToken);

// GET /api/users — any authenticated user
userRouter.get("/", controller.listUsers);

// GET /api/users/:id — any authenticated user
userRouter.get("/:id", controller.getUser);

// POST /api/users — ADMIN only
userRouter.post(
  "/",
  authorizeRole("ADMIN"),
  controller.createUser,
);

// PUT /api/users/:id — ADMIN, or the user themselves.
// Self-check happens in the controller because it needs to compare
// req.user.sub against the URL param. Route-level middleware can't do that.
userRouter.put("/:id", controller.updateUser);

// DELETE /api/users/:id — ADMIN only
userRouter.delete(
  "/:id",
  authorizeRole("ADMIN"),
  controller.deleteUser,
);