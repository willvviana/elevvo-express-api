// src/lib/env.ts

/**
 * Environment variable access layer.
 *
 * Centralizes all `process.env.X` reads. Fails FAST at startup if a
 * required var is missing — not on the first request.
 *
 * Rule: never read `process.env` directly anywhere except here.
 *
 * NOTE: `required` and `optional` both call `.trim()` on the value.
 * This is defensive against invisible whitespace — trailing spaces
 * or newlines — that slip in when pasting values into a hosting
 * provider's env var field. Without trimming, the wrong value
 * reaches the client and causes auth failures like Redis WRONGPASS.
 */

function required(name: string): string {
  const raw = process.env[name];
  if (!raw || raw.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return raw.trim();
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export const env = {
  PORT: Number(optional("PORT", "3000")),

  // Required — server won't start without these
  API_KEY: required("API_KEY"),
  JWT_SECRET: required("JWT_SECRET"),
  REDIS_URL: required("REDIS_URL"),

  // Optional with sane defaults
  JWT_EXPIRES_IN: optional("JWT_EXPIRES_IN", "1h"),
  NODE_ENV: optional("NODE_ENV", "development"),

  // CORS whitelist. Comma-separated in the env var.
  ALLOWED_ORIGINS: optional("ALLOWED_ORIGINS", "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
} as const;

/**
 * Sanity check: JWT secret must be long enough to be safe.
 * HS256 keys shorter than 32 bytes are trivially brute-forced.
 */
if (env.JWT_SECRET.length < 32) {
  throw new Error(
    `JWT_SECRET must be at least 32 characters. Got ${env.JWT_SECRET.length}.`,
  );
}