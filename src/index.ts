// src/index.ts

import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";

import { env } from "./lib/env.js";
import { redisClient, ensureRedisReady, closeRedis } from "./lib/redis.js";
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
      // No Origin header = curl, Postman, or server-to-server.
      // Browsers always send Origin for cross-origin requests.
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
   Registered early so rejected requests still get logged.
   ============================================================ */
app.use(observability);

/* ============================================================
   BODY PARSER
   ============================================================ */
app.use(express.json({ limit: "100kb" }));

/* ============================================================
   RATE LIMITERS — Redis-backed
   
   Both limiters use Redis as the backing store. Why this matters:
   if you run multiple API instances behind a load balancer,
   in-memory counters are isolated per instance. A client gets
   N times the limit by hitting N instances once each. Redis makes
   the counter shared — one global quota per IP.
   
   The `sendCommand` callback hands the store a way to execute raw
   Redis commands. rate-limit-redis uses this to implement atomic
   INCR + EXPIRE.
   ============================================================ */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: "rl:login:",
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
  store: new RedisStore({
    sendCommand: (...args: string[]) => redisClient.sendCommand(args),
    prefix: "rl:global:",
  }),
  message: {
    error: { code: "RATE_LIMITED", message: "Too many requests." },
  },
});

app.use("/api", globalLimiter);

/* ============================================================
   PUBLIC ROUTES
   ============================================================ */

// Health check — no auth, no API key.
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

// Product routes — public reads, admin-only writes.
// No API key required: browsing the catalog should be open.
app.use("/api/products", productRouter);

/* ============================================================
   PROTECTED ROUTES
   ============================================================ */

// Users require API key + JWT (see userRoutes.ts for per-route auth).
app.use("/api/users", requireApiKey, userRouter);

// Orders require JWT only (no API key).
app.use("/api/orders", orderRouter);

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

    // express.json() sets err.status = 400 on malformed JSON.
    // Honor it instead of returning 500 for a client error.
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
const server = app.listen(env.PORT, async () => {
  // Wait for Redis before declaring the server ready. If Redis is
  // unreachable, fail loudly at boot — not silently on the first
  // request that hits a rate limiter.
  try {
    await ensureRedisReady();
  } catch (err) {
    console.error("Redis connection failed:", err);
    process.exit(1);
  }

  console.log(`Server running at http://localhost:${env.PORT}`);
  console.log(`NODE_ENV: ${env.NODE_ENV}`);
  console.log(`CORS origins: ${env.ALLOWED_ORIGINS.join(", ")}`);
});

/**
 * Graceful shutdown. Close the HTTP server first (stop accepting new
 * requests), then close Redis. In-flight requests finish before exit.
 */
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down");
  server.close(async () => {
    await closeRedis();
    process.exit(0);
  });
});