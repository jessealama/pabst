import { randomInt } from "node:crypto";

/** A fresh 32-bit unsigned integer, suitable as a fast-check seed. */
export function randomSeed(): number {
  return randomInt(0, 2 ** 32);
}

/**
 * Parse and validate a `--seed` CLI argument. fast-check seeds are 32-bit
 * integers, so we require a non-negative integer below 2^32.
 */
export function parseSeed(raw: string): number {
  if (!/^\d+$/.test(raw)) {
    throw new Error(`invalid --seed '${raw}': must be a non-negative integer`);
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n >= 2 ** 32) {
    throw new Error(`--seed '${raw}' out of range: must be 0..${2 ** 32 - 1}`);
  }
  return n;
}
