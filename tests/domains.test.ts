import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isDomain, arbitraryFor, DOMAIN_TABLE } from "../src/domains.js";

describe("domains", () => {
  it("maps every domain to its fast-check arbitrary", () => {
    expect(arbitraryFor({ domain: "int" })).toBe("fc.integer()");
    expect(arbitraryFor({ domain: "nat" })).toBe("fc.nat()");
    expect(arbitraryFor({ domain: "number" })).toBe("fc.double()");
    expect(arbitraryFor({ domain: "boolean" })).toBe("fc.boolean()");
    expect(arbitraryFor({ domain: "string" })).toBe("fc.string()");
    expect(arbitraryFor({ domain: "bigint" })).toBe("fc.bigInt()");
  });

  it("recognizes known domains and rejects unknown", () => {
    expect(isDomain("int")).toBe(true);
    expect(isDomain("nat")).toBe(true);
    expect(isDomain("float")).toBe(false);
    expect(isDomain("")).toBe(false);
  });

  it("table has exactly the six MVP domains", () => {
    expect(Object.keys(DOMAIN_TABLE).sort()).toEqual([
      "bigint",
      "boolean",
      "int",
      "nat",
      "number",
      "string",
    ]);
  });
});

describe("arbitraryFor — ranges", () => {
  it("emits bounded integer arbitraries for int and nat", () => {
    expect(
      arbitraryFor({ domain: "int", range: { min: "1", max: "30" } }),
    ).toBe("fc.integer({ min: 1, max: 30 })");
    expect(
      arbitraryFor({ domain: "nat", range: { min: "1", max: "30" } }),
    ).toBe("fc.integer({ min: 1, max: 30 })");
  });

  it("emits a NaN-free bounded double for number", () => {
    expect(
      arbitraryFor({ domain: "number", range: { min: "0.5", max: "1e6" } }),
    ).toBe("fc.double({ min: 0.5, max: 1e6, noNaN: true })");
  });

  it("emits n-suffixed bounds for bigint", () => {
    expect(
      arbitraryFor({ domain: "bigint", range: { min: "0", max: "100" } }),
    ).toBe("fc.bigInt({ min: 0n, max: 100n })");
  });

  it("throws for a range on a non-numeric domain", () => {
    expect(() =>
      arbitraryFor({ domain: "boolean", range: { min: "0", max: "1" } }),
    ).toThrow(/does not support/);
    expect(() =>
      arbitraryFor({ domain: "string", range: { min: "0", max: "1" } }),
    ).toThrow(/does not support/);
  });

  it("keeps unranged domains unchanged", () => {
    expect(arbitraryFor({ domain: "int" })).toBe("fc.integer()");
    expect(arbitraryFor({ domain: "nat" })).toBe("fc.nat()");
    expect(arbitraryFor({ domain: "number" })).toBe("fc.double()");
    expect(arbitraryFor({ domain: "bigint" })).toBe("fc.bigInt()");
  });
});

describe("arbitraryFor — open and unbounded ranges", () => {
  it("nudges open int bounds by ±1 (fc.integer has no exclusion options)", () => {
    expect(
      arbitraryFor({
        domain: "int",
        range: { min: "0", max: "10", minOpen: true, maxOpen: true },
      }),
    ).toBe("fc.integer({ min: 1, max: 9 })");
    expect(
      arbitraryFor({
        domain: "int",
        range: { min: "0", max: "10", minOpen: true },
      }),
    ).toBe("fc.integer({ min: 1, max: 10 })");
  });

  it("clamps unbounded int sides to the safe integer range (fc.integer's implicit defaults are 32-bit and collide with far-out explicit bounds)", () => {
    expect(
      arbitraryFor({ domain: "int", range: { max: "5", minOpen: true } }),
    ).toBe("fc.integer({ min: -9007199254740991, max: 5 })");
    expect(
      arbitraryFor({
        domain: "int",
        range: { min: "0", minOpen: true, maxOpen: true },
      }),
    ).toBe("fc.integer({ min: 1, max: 9007199254740991 })");
    expect(
      arbitraryFor({ domain: "int", range: { minOpen: true, maxOpen: true } }),
    ).toBe("fc.integer({ min: -9007199254740991, max: 9007199254740991 })");
  });

  it("emits one-sided intervals beyond fc.integer's 32-bit defaults that still construct", () => {
    const code = arbitraryFor({
      domain: "int",
      range: { min: "5000000000", maxOpen: true },
    });
    expect(code).toBe("fc.integer({ min: 5000000000, max: 9007199254740991 })");
    expect(() => new Function("fc", `return ${code}`)(fc)).not.toThrow();
    const low = arbitraryFor({
      domain: "int",
      range: { max: "-5000000000", minOpen: true },
    });
    expect(low).toBe(
      "fc.integer({ min: -9007199254740991, max: -5000000000 })",
    );
    expect(() => new Function("fc", `return ${low}`)(fc)).not.toThrow();
  });

  it("clamps an unbounded or adjusted-negative nat minimum to 0", () => {
    expect(
      arbitraryFor({ domain: "nat", range: { max: "5", minOpen: true } }),
    ).toBe("fc.integer({ min: 0, max: 5 })");
    expect(
      arbitraryFor({
        domain: "nat",
        range: { min: "-1", max: "5", minOpen: true },
      }),
    ).toBe("fc.integer({ min: 0, max: 5 })");
    expect(
      arbitraryFor({
        domain: "nat",
        range: { min: "0", minOpen: true, maxOpen: true },
      }),
    ).toBe("fc.integer({ min: 1, max: 9007199254740991 })");
  });

  it("lowers open number bounds to minExcluded/maxExcluded", () => {
    expect(
      arbitraryFor({
        domain: "number",
        range: { min: "0", max: "1", minOpen: true },
      }),
    ).toBe("fc.double({ min: 0, minExcluded: true, max: 1, noNaN: true })");
    expect(
      arbitraryFor({
        domain: "number",
        range: { min: "0", max: "1", maxOpen: true },
      }),
    ).toBe("fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true })");
  });

  it("emits an excluded infinity for open unbounded number sides", () => {
    expect(
      arbitraryFor({
        domain: "number",
        range: { min: "0", minOpen: true, maxOpen: true },
      }),
    ).toBe(
      "fc.double({ min: 0, minExcluded: true, max: Number.POSITIVE_INFINITY, maxExcluded: true, noNaN: true })",
    );
    expect(
      arbitraryFor({
        domain: "number",
        range: { minOpen: true, maxOpen: true },
      }),
    ).toBe(
      "fc.double({ min: Number.NEGATIVE_INFINITY, minExcluded: true, max: Number.POSITIVE_INFINITY, maxExcluded: true, noNaN: true })",
    );
  });

  it("omits closed ∞ number bounds: fc's defaults are inclusive infinities", () => {
    expect(arbitraryFor({ domain: "number", range: { min: "0" } })).toBe(
      "fc.double({ min: 0, noNaN: true })",
    );
    expect(arbitraryFor({ domain: "number", range: {} })).toBe(
      "fc.double({ noNaN: true })",
    );
  });

  it("nudges open bigint bounds and omits unbounded sides", () => {
    expect(
      arbitraryFor({
        domain: "bigint",
        range: { min: "0", max: "100", minOpen: true },
      }),
    ).toBe("fc.bigInt({ min: 1n, max: 100n })");
    expect(
      arbitraryFor({ domain: "bigint", range: { max: "5", minOpen: true } }),
    ).toBe("fc.bigInt({ max: 5n })");
    expect(
      arbitraryFor({
        domain: "bigint",
        range: { minOpen: true, maxOpen: true },
      }),
    ).toBe("fc.bigInt()");
  });
});

describe("arbitraryFor — regex guards", () => {
  it("emits an anchored fc.stringMatching for string + pattern", () => {
    expect(
      arbitraryFor({
        domain: "string",
        pattern: { source: "[a-z]+", flags: "" },
      }),
    ).toBe("fc.stringMatching(/^(?:[a-z]+)$/)");
  });

  it("carries flags through to the emitted literal", () => {
    expect(
      arbitraryFor({
        domain: "string",
        pattern: { source: "\\p{Lu}+", flags: "u" },
      }),
    ).toBe("fc.stringMatching(/^(?:\\p{Lu}+)$/u)");
  });

  it("throws for a pattern on a non-string domain", () => {
    expect(() =>
      arbitraryFor({ domain: "int", pattern: { source: "a", flags: "" } }),
    ).toThrow(/only string/);
  });
});
