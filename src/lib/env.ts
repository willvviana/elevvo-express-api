// src/lib/env.ts

/**
 * Environment variable access layer.
 *
 * Centralizes all `process.env.X` reads. Fails FAST at startup if a
 * required var is missing — not on first request.
 *
 * Rule: never read `process.env` directly anywhere except here.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name]?.trim() || fallback;
}

export const env = {
  PORT: Number(optional("PORT", "3000")),

  API_KEY: required("API_KEY"),
  JWT_SECRET: required("JWT_SECRET"),

  JWT_EXPIRES_IN: optional("JWT_EXPIRES_IN", "1h"),
  NODE_ENV: optional("NODE_ENV", "development"),

  ALLOWED_ORIGINS: optional("ALLOWED_ORIGINS", "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
} as const;

if (env.JWT_SECRET.length < 32) {
  throw new Error(
    `JWT_SECRET must be at least 32 characters. Got ${env.JWT_SECRET.length}.`,
  );
}
