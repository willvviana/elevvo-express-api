// src/index.ts

import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";

import { env } from "./lib/env.js";
import { observability } from "./middleware/observability.js";
import { requireApiKey } from "./middleware/requireApiKey.js";
import { userRouter } from "./routes/userRoutes.js";
import { authRouter } from "./routes/authRoutes.js";

const app = express();

/* ============================================================
   SECURITY HEADERS
   Runs first. Sets X-Frame-Options, X-Content-Type-Options,
   Strict-Transport-Security, and ~10 others on every response.
   One line covers a lot of the OWASP top-10 default headers.
   ============================================================ */
app.use(helmet());

/* ============================================================
   CORS — strict origin whitelist
   Only listed origins can make browser requests.
   `credentials: true` means cookies and Authorization headers
   are allowed — but that REQUIRES a specific origin, never "*".
   ============================================================ */
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no Origin header (curl, Postman, server-to-server).
      // Browsers always send Origin for cross-origin requests; non-browsers don't.
      if (!origin) return callback(null, true);

      if (env.ALLOWED_ORIGINS.includes(origin)) {
        return callback(null, true);
      }
      // Reject. This propagates to the CORS handler which omits the header,
      // and the browser blocks the response.
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
   RATE LIMITERS
   Two separate limiters with different policies:
   - Global: general protection.
   - Login: strict, because brute-forcing passwords is the threat.
   ============================================================ */

/**
 * Login rate limiter.
 * 5 attempts per 15 minutes per IP. Returns 429 Too Many Requests.
 *
 * This is the single most important defense against password brute force.
 * Without it, an attacker can try thousands of passwords per second.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutes
  max: 5,                      // 5 requests per window per IP
  standardHeaders: true,       // send RateLimit-* headers
  legacyHeaders: false,        // disable X-RateLimit-* (deprecated)
  message: {
    error: {
      code: "RATE_LIMITED",
      message: "Too many login attempts. Try again in 15 minutes.",
    },
  },
});

/**
 * Global limiter. Generous — we don't want to break legitimate use.
 * 100 requests per minute per IP.
 */
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
   PUBLIC ROUTES (no API key, no JWT)
   ============================================================ */

// Health check — used by uptime monitors and load balancers.
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// Login and signup — public, but login has its own rate limiter.
app.use("/api/auth/login", loginLimiter);
app.use("/api/auth", authRouter);

/* ============================================================
   PROTECTED ROUTES
   API key required. JWT required per-route (see userRoutes.ts).
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
   Express identifies this by the 4-argument signature.
   Must be last.
   ============================================================ */
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Unhandled error:", err);
    if (res.headersSent) return;
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