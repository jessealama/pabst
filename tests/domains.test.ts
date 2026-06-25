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
    expect(Object.keys(DOMAIN_TABLE).sort()).toEqual(
      ["bigint", "boolean", "int", "nat", "number", "string"]
    );
  });
});
