// src/index.ts

import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

import { env } from "./lib/env.js";
import { observability } from "./middleware/observability.js";
import { requireApiKey } from "./middleware/requireApiKey.js";
import { userRouter } from "./routes/userRoutes.js";
import { authRouter } from "./routes/authRoutes.js";
import { productRouter } from "./routes/productRoutes.js";
import { orderRouter } from "./routes/orderRoutes.js";

const app = express();

/* ============================================================
   SECURITY HEADERS
   ============================================================ */
app.use(helmet());

/* ============================================================
   CORS — strict origin whitelist
   ============================================================ */
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

/* ============================================================
   OBSERVABILITY
   ============================================================ */
app.use(observability);

/* ============================================================
   BODY PARSER
   ============================================================ */
app.use(express.json({ limit: "100kb" }));

/* ============================================================
   RATE LIMITERS
   ============================================================ */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
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
  message: {
    error: { code: "RATE_LIMITED", message: "Too many requests." },
  },
});

app.use("/api", globalLimiter);

/* ============================================================
   PUBLIC ROUTES
   ============================================================ */

// Health check — public, no auth, no API key.
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Auth routes. Login has its own stricter limiter applied first.
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", authRouter);

// Product routes — PUBLIC reads, ADMIN-only writes.
// Note: no requireApiKey here. Browsing the catalog shouldn't need a secret.
app.use("/api/products", productRouter);
app.use("/api/orders", orderRouter);

/* ============================================================
   PROTECTED ROUTES
   API key + JWT required. See userRoutes.ts for per-route auth.
   ============================================================ */
app.use("/api/users", requireApiKey, userRouter);

/* ============================================================
   404 HANDLER
   ============================================================ */
app.use((req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `Cannot ${req.method} ${req.path}` },
  });
});

/* ============================================================
   GLOBAL ERROR HANDLER
   ============================================================ */
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

/* ============================================================
   START
   ============================================================ */
const server = app.listen(env.PORT, () => {
  console.log(`Server running at http://localhost:${env.PORT}`);
  console.log(`NODE_ENV: ${env.NODE_ENV}`);
  console.log(`CORS origins: ${env.ALLOWED_ORIGINS.join(", ")}`);
});

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down");
  server.close(() => process.exit(0));
});