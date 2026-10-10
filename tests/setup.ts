// tests/setup.ts

import * as dotenv from "dotenv";
dotenv.config({ quiet: true });

/**
 * Test environment setup.
 *
 * Runs before any test file loads. Its job:
 * - Point Prisma at the TEST database, not the dev database.
 * - Fail fast if TEST_DATABASE_URL isn't set.
 *
 * This must run BEFORE any module imports Prisma. Jest's
 * setupFilesAfterEnv guarantees that ordering.
 */

const testDbUrl = process.env.TEST_DATABASE_URL;

if (!testDbUrl) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Add it to .env before running tests.",
  );
}

// Override DATABASE_URL so the Prisma client in src/lib/store.ts
// connects to the test DB.
process.env.DATABASE_URL = testDbUrl;

// Set required env vars that env.ts validates at import time.
// These are test-only values, not real secrets.
process.env.API_KEY = "test-api-key";
process.env.JWT_SECRET = "test-jwt-secret-at-least-32-characters-long";
process.env.JWT_EXPIRES_IN = "1h";
process.env.ALLOWED_ORIGINS = "http://localhost:5173";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.NODE_ENV = "test";