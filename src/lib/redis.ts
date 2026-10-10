// src/lib/redis.ts

import { createClient, type RedisClientType } from "redis";
import { env } from "./env.js";

/**
 * Redis client — singleton.
 *
 * Same pattern as Prisma: one client for the whole app. Creating a new
 * client per request would open a new TCP connection each time.
 *
 * createClient() is lazy — it doesn't connect until .connect() runs.
 */

const client: RedisClientType = createClient({ url: env.REDIS_URL });

// Redis errors are swallowed unless a listener exists. Log them.
client.on("error", (err) => {
  console.error("Redis error:", err);
});

/**
 * Connect on first import. The promise is stored so callers can await it.
 * Node's module cache means this runs exactly once.
 */
const connectPromise: Promise<void> = (async () => {
  if (!client.isOpen) {
    await client.connect();
    const url = new URL(env.REDIS_URL);
    console.log(`Redis connected to ${url.host}`);
  }
})();

/**
 * Wait for Redis to be connected. Call this at server startup to fail
 * fast if Redis is unreachable — better than failing on the first request.
 */
export async function ensureRedisReady(): Promise<void> {
  await connectPromise;
}

/* ---------------- Cache helpers ---------------- */

/**
 * Get a cached value. Returns null on miss or on parse error.
 * Values are stored as JSON strings; we parse on read.
 */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await client.get(key);
  if (raw === null) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt cache entry. Delete it and treat as a miss so the caller
    // refetches. Without this, a malformed entry causes repeated failures.
    await client.del(key);
    return null;
  }
}

/**
 * Set a cached value with a TTL in seconds.
 *
 * Redis supports both EX (seconds) and PX (milliseconds). We use seconds
 * because the TTLs in this project are in minutes/hours.
 */
export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
}

/**
 * Delete one key. Used for targeted invalidation.
 */
export async function cacheDel(key: string): Promise<void> {
  await client.del(key);
}

/**
 * Delete every key matching a pattern.
 *
 * Uses SCAN, not KEYS. KEYS blocks the Redis server while it walks the
 * entire keyspace — a real outage risk in production. SCAN batches the
 * work and returns a cursor. We loop until the cursor returns to 0.
 */
export async function cacheDelPattern(pattern: string): Promise<void> {
  // redis@6 uses string cursors (Redis protocol returns them as strings).
  // Start at "0", loop until the server returns "0" back.
  let cursor = "0";

  do {
    const reply = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
    cursor = reply.cursor;
    if (reply.keys.length > 0) {
      await client.del(reply.keys);
    }
  } while (cursor !== "0");
}

/**
 * Raw client for the rate limiter. Prefer the helpers above otherwise.
 */
export const redisClient = client;

/**
 * Graceful shutdown. Called on SIGTERM.
 */
export async function closeRedis(): Promise<void> {
  if (client.isOpen) {
    await client.quit();
  }
}