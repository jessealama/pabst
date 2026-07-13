import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { isDomain, arbitraryFor, DOMAIN_TABLE } from "../src/domains.js";

describe("domains", () => {
  it("maps every domain to its fast-check arbitrary", () => {
    expect(arbitraryFor("int")).toBe("fc.integer()");
    expect(arbitraryFor("nat")).toBe("fc.nat()");
    expect(arbitraryFor("number")).toBe("fc.double()");
    expect(arbitraryFor("boolean")).toBe("fc.boolean()");
    expect(arbitraryFor("string")).toBe("fc.string()");
    expect(arbitraryFor("bigint")).toBe("fc.bigInt()");
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
    expect(arbitraryFor("int", { min: "1", max: "30" })).toBe(
      "fc.integer({ min: 1, max: 30 })",
    );
    expect(arbitraryFor("nat", { min: "1", max: "30" })).toBe(
      "fc.integer({ min: 1, max: 30 })",
    );
  });

  it("emits a NaN-free bounded double for number", () => {
    expect(arbitraryFor("number", { min: "0.5", max: "1e6" })).toBe(
      "fc.double({ min: 0.5, max: 1e6, noNaN: true })",
    );
  });

  it("emits n-suffixed bounds for bigint", () => {
    expect(arbitraryFor("bigint", { min: "0", max: "100" })).toBe(
      "fc.bigInt({ min: 0n, max: 100n })",
    );
  });

  it("throws for a range on a non-numeric domain", () => {
    expect(() => arbitraryFor("boolean", { min: "0", max: "1" })).toThrow(
      /does not support/,
    );
    expect(() => arbitraryFor("string", { min: "0", max: "1" })).toThrow(
      /does not support/,
    );
  });

  it("keeps unranged domains unchanged", () => {
    expect(arbitraryFor("int")).toBe("fc.integer()");
    expect(arbitraryFor("nat")).toBe("fc.nat()");
    expect(arbitraryFor("number")).toBe("fc.double()");
    expect(arbitraryFor("bigint")).toBe("fc.bigInt()");
  });
});

describe("arbitraryFor — open and unbounded ranges", () => {
  it("nudges open int bounds by ±1 (fc.integer has no exclusion options)", () => {
    expect(
      arbitraryFor("int", {
        min: "0",
        max: "10",
        minOpen: true,
        maxOpen: true,
      }),
    ).toBe("fc.integer({ min: 1, max: 9 })");
    expect(arbitraryFor("int", { min: "0", max: "10", minOpen: true })).toBe(
      "fc.integer({ min: 1, max: 10 })",
    );
  });

  it("clamps unbounded int sides to the safe integer range (fc.integer's implicit defaults are 32-bit and collide with far-out explicit bounds)", () => {
    expect(arbitraryFor("int", { max: "5", minOpen: true })).toBe(
      "fc.integer({ min: -9007199254740991, max: 5 })",
    );
    expect(
      arbitraryFor("int", { min: "0", minOpen: true, maxOpen: true }),
    ).toBe("fc.integer({ min: 1, max: 9007199254740991 })");
    expect(arbitraryFor("int", { minOpen: true, maxOpen: true })).toBe(
      "fc.integer({ min: -9007199254740991, max: 9007199254740991 })",
    );
  });

  it("emits one-sided intervals beyond fc.integer's 32-bit defaults that still construct", () => {
    const code = arbitraryFor("int", { min: "5000000000", maxOpen: true });
    expect(code).toBe("fc.integer({ min: 5000000000, max: 9007199254740991 })");
    expect(() => new Function("fc", `return ${code}`)(fc)).not.toThrow();
    const low = arbitraryFor("int", { max: "-5000000000", minOpen: true });
    expect(low).toBe(
      "fc.integer({ min: -9007199254740991, max: -5000000000 })",
    );
    expect(() => new Function("fc", `return ${low}`)(fc)).not.toThrow();
  });

  it("clamps an unbounded or adjusted-negative nat minimum to 0", () => {
    expect(arbitraryFor("nat", { max: "5", minOpen: true })).toBe(
      "fc.integer({ min: 0, max: 5 })",
    );
    expect(arbitraryFor("nat", { min: "-1", max: "5", minOpen: true })).toBe(
      "fc.integer({ min: 0, max: 5 })",
    );
    expect(
      arbitraryFor("nat", { min: "0", minOpen: true, maxOpen: true }),
    ).toBe("fc.integer({ min: 1, max: 9007199254740991 })");
  });

  it("lowers open number bounds to minExcluded/maxExcluded", () => {
    expect(arbitraryFor("number", { min: "0", max: "1", minOpen: true })).toBe(
      "fc.double({ min: 0, minExcluded: true, max: 1, noNaN: true })",
    );
    expect(arbitraryFor("number", { min: "0", max: "1", maxOpen: true })).toBe(
      "fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true })",
    );
  });

  it("emits an excluded infinity for open unbounded number sides", () => {
    expect(
      arbitraryFor("number", { min: "0", minOpen: true, maxOpen: true }),
    ).toBe(
      "fc.double({ min: 0, minExcluded: true, max: Number.POSITIVE_INFINITY, maxExcluded: true, noNaN: true })",
    );
    expect(arbitraryFor("number", { minOpen: true, maxOpen: true })).toBe(
      "fc.double({ min: Number.NEGATIVE_INFINITY, minExcluded: true, max: Number.POSITIVE_INFINITY, maxExcluded: true, noNaN: true })",
    );
  });

  it("omits closed ∞ number bounds: fc's defaults are inclusive infinities", () => {
    expect(arbitraryFor("number", { min: "0" })).toBe(
      "fc.double({ min: 0, noNaN: true })",
    );
    expect(arbitraryFor("number", {})).toBe("fc.double({ noNaN: true })");
  });

  it("nudges open bigint bounds and omits unbounded sides", () => {
    expect(
      arbitraryFor("bigint", { min: "0", max: "100", minOpen: true }),
    ).toBe("fc.bigInt({ min: 1n, max: 100n })");
    expect(arbitraryFor("bigint", { max: "5", minOpen: true })).toBe(
      "fc.bigInt({ max: 5n })",
    );
    expect(arbitraryFor("bigint", { minOpen: true, maxOpen: true })).toBe(
      "fc.bigInt()",
    );
  });
});
