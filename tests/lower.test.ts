import { describe, it, expect } from "vitest";
import { lowerExpr, lowerTop } from "../src/lower.js";
import type { Formula } from "../src/formula-ast.js";

const atom = (text: string): Formula => ({ kind: "atom", text });

describe("lowerExpr", () => {
  it("wraps an atom in __bool with its source text", () => {
    expect(lowerExpr(atom("f(x)"))).toBe('__bool(f(x), "f(x)")');
  });
  it("lowers ¬ ∧ ∨ ↔ to JS operators over __bool atoms", () => {
    expect(lowerExpr({ kind: "not", arg: atom("p") })).toBe(
      '!(__bool(p, "p"))',
    );
    expect(lowerExpr({ kind: "and", left: atom("a"), right: atom("b") })).toBe(
      '(__bool(a, "a") && __bool(b, "b"))',
    );
    expect(lowerExpr({ kind: "or", left: atom("a"), right: atom("b") })).toBe(
      '(__bool(a, "a") || __bool(b, "b"))',
    );
    expect(lowerExpr({ kind: "iff", left: atom("a"), right: atom("b") })).toBe(
      '(__bool(a, "a") === __bool(b, "b"))',
    );
  });
  it("lowers a NESTED implication to material implication", () => {
    expect(
      lowerExpr({
        kind: "implication",
        antecedents: [atom("a")],
        consequent: atom("c"),
      }),
    ).toBe('(!(__bool(a, "a")) || __bool(c, "c"))');
    expect(
      lowerExpr({
        kind: "implication",
        antecedents: [atom("a"), atom("b")],
        consequent: atom("c"),
      }),
    ).toBe('(!(__bool(a, "a")) || (!(__bool(b, "b")) || __bool(c, "c")))');
  });
});

describe("lowerTop", () => {
  it("routes a top-level implication's antecedents to preconditions", () => {
    expect(
      lowerTop({
        kind: "implication",
        antecedents: [atom("a"), atom("b")],
        consequent: atom("c"),
      }),
    ).toEqual({
      preconditions: ['__bool(a, "a")', '__bool(b, "b")'],
      body: '__bool(c, "c")',
    });
  });
  it("returns no preconditions for a non-implication body", () => {
    expect(
      lowerTop({ kind: "and", left: atom("a"), right: atom("b") }),
    ).toEqual({
      preconditions: [],
      body: '(__bool(a, "a") && __bool(b, "b"))',
    });
  });
});
