import { describe, it, expect } from "vitest";
import { parseFormula } from "../src/parse-formula.js";

describe("parseFormula — binders", () => {
  it("reads each parameter as a binder with its domain", () => {
    const r = parseFormula("(x: int, y: number) => foo(x, y) !== 0");
    expect(r.binders).toEqual([
      { varName: "x", domain: "int" },
      { varName: "y", domain: "number" },
    ]);
    expect(r.preconditions).toEqual([]);
    expect(r.body).toBe("foo(x, y) !== 0");
  });

  it("reads a single binder", () => {
    const r = parseFormula("(n: nat) => bar(n) >= 0");
    expect(r.binders).toEqual([{ varName: "n", domain: "nat" }]);
    expect(r.body).toBe("bar(n) >= 0");
  });
});

describe("parseFormula — preconditions (block body)", () => {
  it("lifts a pre(...) guard to a precondition and reads the return as the body", () => {
    const r = parseFormula("(x: nat) => { pre(x > 100); return foo(x) > 0; }");
    expect(r.binders).toEqual([{ varName: "x", domain: "nat" }]);
    expect(r.preconditions).toEqual(["x > 100"]);
    expect(r.body).toBe("foo(x) > 0");
  });

  it("lifts multiple pre(...) guards in order", () => {
    const r = parseFormula("(x: int) => { pre(x > 0); pre(x < 9); return ok(x); }");
    expect(r.preconditions).toEqual(["x > 0", "x < 9"]);
    expect(r.body).toBe("ok(x)");
  });
});

describe("parseFormula — implies in the body is allowed text", () => {
  it("keeps implies(...) verbatim in the body", () => {
    const r = parseFormula("(x: int, y: number) => implies(Number.isInteger(y), foo(x, y) !== 0)");
    expect(r.body).toBe("implies(Number.isInteger(y), foo(x, y) !== 0)");
  });
});

describe("parseFormula — errors", () => {
  it("rejects a formula that is not an arrow function", () => {
    expect(() => parseFormula("foo(x) === x")).toThrow(/must be an arrow function/);
  });
  it("rejects a binder with no domain annotation", () => {
    expect(() => parseFormula("(x) => foo(x)")).toThrow(/needs a domain/);
  });
  it("rejects an unknown domain", () => {
    expect(() => parseFormula("(x: float) => x === x")).toThrow(/unknown generation domain 'float'/);
  });
  it("requires at least one binder", () => {
    expect(() => parseFormula("() => true")).toThrow(/at least one binder/);
  });
  it("rejects destructuring binders", () => {
    expect(() => parseFormula("({ x }: int) => x")).toThrow(/simple name/);
  });
  it("rejects a block body with no return", () => {
    expect(() => parseFormula("(x: int) => { pre(x > 0); }")).toThrow(/must return/);
  });
  it("rejects a block body with a non-pre, non-return statement", () => {
    expect(() => parseFormula("(x: int) => { const y = x; return y === x; }")).toThrow(/only pre\(\.\.\.\) and one return/);
  });
});
