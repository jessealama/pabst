import { describe, it, expect } from "vitest";
import { desugar } from "../src/desugar.js";

describe("desugar", () => {
  it("leaves an arrow-free body untouched", () => {
    expect(desugar("foo(x, y) !== 0")).toEqual({ preconditions: [], body: "foo(x, y) !== 0" });
  });

  it("lifts a single top-level ==> antecedent to a precondition", () => {
    expect(desugar("Math.isInteger(y) ==> foo(x, y) !== 0")).toEqual({
      preconditions: ["Math.isInteger(y)"],
      body: "foo(x, y) !== 0",
    });
  });

  it("lifts a chain of top-level antecedents", () => {
    expect(desugar("A ==> B ==> C")).toEqual({ preconditions: ["A", "B"], body: "C" });
  });

  it("accepts -> and the Unicode → spelling", () => {
    expect(desugar("P -> Q")).toEqual({ preconditions: ["P"], body: "Q" });
    expect(desugar("P → Q")).toEqual({ preconditions: ["P"], body: "Q" });
  });

  it("rewrites a nested implication to boolean !(P) || (Q)", () => {
    expect(desugar("A || (B -> C)")).toEqual({
      preconditions: [],
      body: "A || (!(B) || (C))",
    });
  });

  it("does not split on => arrow functions or on call commas", () => {
    expect(desugar("arr.every(z => z > 0)")).toEqual({
      preconditions: [],
      body: "arr.every(z => z > 0)",
    });
  });

  it("does not split arrows inside string literals", () => {
    expect(desugar('s === "a -> b"')).toEqual({
      preconditions: [],
      body: 's === "a -> b"',
    });
  });
});
