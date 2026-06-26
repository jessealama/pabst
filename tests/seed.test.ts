import { describe, it, expect } from "vitest";
import { randomSeed, parseSeed } from "../src/seed.js";

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

  it("rejects non-integers", () => {
    expect(() => parseSeed("4.2")).toThrow(/invalid --seed/);
    expect(() => parseSeed("abc")).toThrow(/invalid --seed/);
    expect(() => parseSeed("-1")).toThrow(/invalid --seed/);
  });

  it("rejects values at or above 2^32", () => {
    expect(() => parseSeed(String(2 ** 32))).toThrow(/out of range/);
  });
});
