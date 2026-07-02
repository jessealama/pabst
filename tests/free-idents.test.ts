import { describe, it, expect } from "vitest";
import { freeIdentifiers, classify } from "../src/free-idents.js";

describe("freeIdentifiers", () => {
  it("collects references but not property names", () => {
    const ids = freeIdentifiers("Number.isInteger(y) && foo(x, y) !== 0");
    expect([...ids].sort()).toEqual(["Number", "foo", "x", "y"]);
  });

  it("excludes object-literal keys but keeps value refs", () => {
    const ids = freeIdentifiers("({ a: x }).a === x");
    expect([...ids].sort()).toEqual(["x"]);
  });

  it("excludes the right side of a qualified type name", () => {
    // In `x as Foo.Bar`, `Bar` is the right of a qualified name and must be
    // dropped; `Foo` (the left) and `x` remain.
    const ids = freeIdentifiers("x as Foo.Bar");
    expect([...ids].sort()).toEqual(["Foo", "x"]);
  });
});

describe("classify", () => {
  const bound = new Set(["x", "y"]);
  const exports = new Set(["foo"]);

  it("routes module exports to freeExports and ignores bound vars + globals", () => {
    const ids = new Set(["x", "y", "Math", "foo"]);
    expect(classify(ids, bound, exports, "nonzero", "foo.ts")).toEqual({ freeExports: ["foo"] });
  });

  it("throws on an unexported, non-global, non-bound identifier", () => {
    const ids = new Set(["x", "bar"]);
    expect(() => classify(ids, bound, exports, "nonzero", "foo.ts")).toThrow(
      "property 'nonzero' references 'bar', which is not exported from foo.ts"
    );
  });
});
