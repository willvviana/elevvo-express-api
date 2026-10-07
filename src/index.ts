// src/index.ts

import express from "express";
import { observability } from "./middleware/observability.js";
import { requireApiKey } from "./middleware/requireApiKey.js";
import { userRouter } from "./routes/userRoutes.js";

const PORT = Number(process.env.PORT ?? 3000);

const app = express();

/* ============================================================
   MIDDLEWARE PIPELINE
   Order matters. Express runs these top-to-bottom on every request.
   ============================================================ */

// 1. Observability FIRST — logs even requests that get rejected downstream.
//    If this ran later, unauthorized requests wouldn't be logged.
app.use(observability);

// 2. Body parser. Parses JSON request bodies into req.body.
//    Without this, req.body is undefined on POST/PUT.
//    The limit prevents giant payloads from DoS-ing the server.
app.use(express.json({ limit: "100kb" }));

// 3. API key guard. Only applied to /api routes.
//    Apply it selectively — public endpoints (health checks) shouldn't need it.
app.use("/api", requireApiKey);

/* ============================================================
   ROUTES
   ============================================================ */

// Health check. Public — no API key required.
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

// User resource routes.
app.use("/api/users", userRouter);

/* ============================================================
   404 HANDLER
   Runs if no route matched above.
   ============================================================ */
app.use((req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: `Cannot ${req.method} ${req.path}` },
  });
});

/* ============================================================
   GLOBAL ERROR HANDLER
   Express identifies this by its 4-argument signature.
   Must be registered LAST.
   ============================================================ */
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error("Unhandled error:", err);
    // If headers were already sent, we can't send a response.
    // Express requires us to delegate to the default handler in that case.
    if (res.headersSent) return;
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Internal server error" },
    });
  },
);

/* ============================================================
   START SERVER
   ============================================================ */
const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`API key required for /api/* routes`);
  console.log(`  Set with:  $env:API_KEY="your-secret-key"`);
});

/* ============================================================
   GRACEFUL SHUTDOWN
   ============================================================ */
process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down");
  server.close(() => process.exit(0));
});