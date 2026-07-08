import { describe, it, expect } from "vitest";
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
