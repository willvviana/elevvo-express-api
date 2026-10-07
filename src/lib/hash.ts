// src/lib/hash.ts

import bcrypt from "bcrypt";

/**
 * Password hashing.
 *
 * WHY BCRYPT:
 * - Deliberately slow. Cost factor 12 means ~250ms per hash on modern hardware.
 *   That's fine for one login attempt. It's brutal for a brute-force attacker.
 * - Automatic salt generation. Every hash is unique even for identical passwords.
 * - Industry standard. Battle-tested for 20+ years.
 *
 * COST FACTOR CHOICE:
 * - 10 = ~100ms. Common in 2010s.
 * - 12 = ~250ms. Current default.
 * - 14 = ~1s. High security, noticeable lag on login.
 * Choose the highest factor that keeps login under ~300ms on your hardware.
 */

const COST_FACTOR = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST_FACTOR);
}

/**
 * Compare a plaintext password against a hash.
 *
 * WHY NOT `===`:
 * Comparing strings with `===` short-circuits on the first differing byte.
 * An attacker can measure response time to figure out how many prefix
 * bytes they got right. bcrypt.compare() runs in constant time regardless
 * of where the mismatch is.
 *
 * Returns true if the password matches, false otherwise.
 * Never throws on wrong password — that's a normal case.
 */
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}