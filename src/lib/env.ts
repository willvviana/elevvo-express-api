// src/lib/env.ts

/**
 * Environment variable access layer.
 *
 * Why this file exists:
 * - Centralizes all `process.env.X` reads. One place to audit.
 * - Fails FAST at startup if a required var is missing — not on first request.
 * - Provides type-safe access. No `process.env.JWT_SECRET!` scattered around.
 *
 * Rule: never read `process.env` directly anywhere except here.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    // Crash immediately, with a clear message. Better than a confusing
    // "undefined is not a string" error three requests later.
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export const env = {
  PORT: Number(optional("PORT", "3000")),

  // Required — server won't start without these
  API_KEY: required("API_KEY"),
  JWT_SECRET: required("JWT_SECRET"),

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