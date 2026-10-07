// src/routes/authRoutes.ts

import { Router } from "express";
import * as authController from "../controllers/authController.js";
import { authenticateToken } from "../middleware/authenticateToken.js";

export const authRouter = Router();

/**
 * Public routes. No token needed.
 * Rate limiting is applied at the app level for /api/auth.
 */
authRouter.post("/login", authController.login);
authRouter.post("/signup", authController.signup);

/**
 * Protected route. Requires a valid JWT.
 * The middleware runs first. If it calls next(), the handler runs.
 */
authRouter.get("/me", authenticateToken, authController.me);