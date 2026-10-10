// src/app.ts

import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";

import { env } from "./lib/env.js";
import { redisClient } from "./lib/redis.js";
import { observability } from "./middleware/observability.js";
import { requireApiKey } from "./middleware/requireApiKey.js";
import { userRouter } from "./routes/userRoutes.js";
import { authRouter } from "./routes/authRoutes.js";
import { productRouter } from "./routes/productRoutes.js";
import { orderRouter } from "./routes/orderRoutes.js";

/**
 * Build the Express app. Separated from src/index.ts so tests can
 * import the app without binding a port.
 */
export function createApp(): express.Express {
  const app = express();

  app.use(helmet());

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (env.ALLOWED_ORIGINS.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error(`Origin not allowed: ${origin}`));
      },
      credentials: true,
    }),
  );

  app.use(observability);
  app.use(express.json({ limit: "100kb" }));

  // In tests, skip rate limiters so tests don't consume quota or
  // interfere with each other. Production uses Redis-backed stores.
  const isTest = env.NODE_ENV === "test";

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    ...(isTest
      ? { skip: () => true }
      : {
          store: new RedisStore({
            sendCommand: (...args: string[]) => redisClient.sendCommand(args),
            prefix: "rl:login:",
          }),
        }),
    message: {
      error: {
        code: "RATE_LIMITED",
        message: "Too many login attempts. Try again in 15 minutes.",
      },
    },
  });

  const globalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    ...(isTest
      ? { skip: () => true }
      : {
          store: new RedisStore({
            sendCommand: (...args: string[]) => redisClient.sendCommand(args),
            prefix: "rl:global:",
          }),
        }),
    message: {
      error: { code: "RATE_LIMITED", message: "Too many requests." },
    },
  });

  app.use("/api", globalLimiter);

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api/auth/login", loginLimiter);
  app.use("/api/auth", authRouter);
  app.use("/api/products", productRouter);
  app.use("/api/users", requireApiKey, userRouter);
  app.use("/api/orders", orderRouter);

// Root route — helpful landing info for anyone who visits the bare URL.
app.get("/", (_req, res) => {
  res.json({
    service: "elevvo-express-api",
    status: "ok",
    docs: {
      health: "/api/health",
      products: "/api/products",
      login: "POST /api/auth/login",
      users: "GET /api/users (auth required)",
      orders: "GET /api/orders (auth required)",
    },
  });
});

  app.use((req, res) => {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: `Cannot ${req.method} ${req.path}` },
    });
  });

  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (res.headersSent) return;

      let status = 500;
      if (
        typeof err === "object" &&
        err !== null &&
        "status" in err &&
        typeof (err as { status: unknown }).status === "number"
      ) {
        status = (err as { status: number }).status;
      }

      console.error("Unhandled error:", err);

      if (status === 400) {
        res.status(400).json({
          error: { code: "BAD_REQUEST", message: "Malformed request body" },
        });
        return;
      }

      res.status(500).json({
        error: { code: "INTERNAL_ERROR", message: "Internal server error" },
      });
    },
  );

  return app;
}