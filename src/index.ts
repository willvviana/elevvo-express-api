// src/index.ts

import "dotenv/config";
import { env } from "./lib/env.js";
import { ensureRedisReady, closeRedis } from "./lib/redis.js";
import { createApp } from "./app.js";

const app = createApp();

const server = app.listen(env.PORT, async () => {
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

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down");
  server.close(async () => {
    await closeRedis();
    process.exit(0);
  });
});