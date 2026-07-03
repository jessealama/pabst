import { describe, it, expect } from "vitest";
import { randomSeed, parseSeed } from "../src/seed.js";
import { PabstError } from "../src/errors.js";

describe("randomSeed", () => {
  it("returns an integer in the 32-bit unsigned range", () => {
    for (let i = 0; i < 100; i++) {
      const s = randomSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(2 ** 32);
    }
  });
});

describe("parseSeed", () => {
  it("parses a valid non-negative integer", () => {
    expect(parseSeed("42")).toBe(42);
    expect(parseSeed("0")).toBe(0);
    expect(parseSeed(String(2 ** 32 - 1))).toBe(2 ** 32 - 1);
  });

  // A bad --seed is user input at fault, so it must be a PabstError: the CLI
  // maps those to exit 2 and rethrows anything else as an internal bug.
  it("rejects non-integers with a user-facing PabstError", () => {
    expect(() => parseSeed("4.2")).toThrow(PabstError);
    expect(() => parseSeed("4.2")).toThrow(/invalid --seed/);
    expect(() => parseSeed("abc")).toThrow(/invalid --seed/);
    expect(() => parseSeed("-1")).toThrow(/invalid --seed/);
  });

  it("rejects values at or above 2^32 with a user-facing PabstError", () => {
    expect(() => parseSeed(String(2 ** 32))).toThrow(PabstError);
    expect(() => parseSeed(String(2 ** 32))).toThrow(/out of range/);
  });
});
