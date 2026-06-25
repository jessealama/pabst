import { describe, it, expect } from "vitest";
import { parsePrefix } from "../src/prefix-parser.js";

describe("parsePrefix", () => {
  it("parses multiple binder groups and the body", () => {
    const r = parsePrefix("forall (x: int) (y: number), foo(x, y) !== 0");
    expect(r.binders).toEqual([
      { varName: "x", domain: "int" },
      { varName: "y", domain: "number" },
    ]);
    expect(r.body).toBe("foo(x, y) !== 0");
  });

  it("supports Lean-style multi-var grouping", () => {
    const r = parsePrefix("forall (x y: int), x + y === y + x");
    expect(r.binders).toEqual([
      { varName: "x", domain: "int" },
      { varName: "y", domain: "int" },
    ]);
    expect(r.body).toBe("x + y === y + x");
  });

  it("accepts the Unicode ∀ form", () => {
    const r = parsePrefix("∀ (n: nat), n >= 0");
    expect(r.binders).toEqual([{ varName: "n", domain: "nat" }]);
    expect(r.body).toBe("n >= 0");
  });

  it("splits prefix from body at the first depth-0 comma, ignoring call commas", () => {
    const r = parsePrefix("forall (x: int), f(x, x) === g(x, x)");
    expect(r.binders).toEqual([{ varName: "x", domain: "int" }]);
    expect(r.body).toBe("f(x, x) === g(x, x)");
  });

  it("rejects an unknown domain", () => {
    expect(() => parsePrefix("forall (x: float), x === x")).toThrow(/unknown generation domain 'float'/);
  });

  it("requires forall", () => {
    expect(() => parsePrefix("(x: int), x === x")).toThrow(/forall/);
  });

  it("requires at least one binder group", () => {
    expect(() => parsePrefix("forall , x === x")).toThrow(/binder group/);
  });
});
