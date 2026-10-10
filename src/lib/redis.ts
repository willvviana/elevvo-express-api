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
    // Log only the host — never the credentials.
    const url = new URL(env.REDIS_URL);
    console.log(`Redis connected to ${url.host}`);
  }
})();

/**
 * Wait for Redis to be connected. Call at server startup to fail fast.
 */
export async function ensureRedisReady(): Promise<void> {
  await connectPromise;
}

/* ---------------- Cache helpers ---------------- */

export async function cacheGet<T>(key: string): Promise<T | null> {
  const raw = await client.get(key);
  if (raw === null) return null;

  try {
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt entry — delete it and treat as a miss.
    await client.del(key);
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<void> {
  await client.set(key, JSON.stringify(value), { EX: ttlSeconds });
}

export async function cacheDel(key: string): Promise<void> {
  await client.del(key);
}

/**
 * Delete all keys matching a pattern.
 *
 * Uses SCAN, not KEYS. KEYS blocks the server while it walks the
 * entire keyspace — a real outage risk. SCAN batches the work.
 *
 * redis@6 uses string cursors (the Redis protocol returns them as
 * strings). Start at "0", loop until the server returns "0" back.
 */
export async function cacheDelPattern(pattern: string): Promise<void> {
  let cursor = "0";

  do {
    const reply = await client.scan(cursor, { MATCH: pattern, COUNT: 100 });
    cursor = reply.cursor;
    if (reply.keys.length > 0) {
      await client.del(reply.keys);
    }
  } while (cursor !== "0");
}

export const redisClient = client;

export async function closeRedis(): Promise<void> {
  if (client.isOpen) {
    await client.quit();
  }
}