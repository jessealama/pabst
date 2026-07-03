import { describe, it, expect } from "vitest";
import { parseBody } from "../src/formula-parser.js";
import { lowerTop } from "../src/lower.js";
import { expectPabstError } from "./helpers/errors.js";

// Lower the parsed AST to a string so assertions read clearly.
const lo = (s: string) => lowerTop(parseBody(s));

describe("parseBody — precedence", () => {
  it("¬ binds tighter than ∧ binds tighter than ∨", () => {
    expect(lo("¬a ∧ b ∨ c")).toEqual({
      preconditions: [],
      body: '((!(__bool(a, "a")) && __bool(b, "b")) || __bool(c, "c"))',
    });
  });
  it("→ is looser than ∨ and routes the antecedent to a precondition (top level)", () => {
    expect(lo("a ∨ b → c")).toEqual({
      preconditions: ['(__bool(a, "a") || __bool(b, "b"))'],
      body: '__bool(c, "c")',
    });
  });
  it("a → chain makes each antecedent a precondition", () => {
    expect(lo("a → b → c")).toEqual({
      preconditions: ['__bool(a, "a")', '__bool(b, "b")'],
      body: '__bool(c, "c")',
    });
  });
  it("parenthesised → is nested/material, not a precondition", () => {
    expect(lo("(a → b) ∧ c")).toEqual({
      preconditions: [],
      body: '((!(__bool(a, "a")) || __bool(b, "b")) && __bool(c, "c"))',
    });
  });
  it("↔ is loosest and lowers to ===", () => {
    expect(lo("a ∧ b ↔ c")).toEqual({
      preconditions: [],
      body: '((__bool(a, "a") && __bool(b, "b")) === __bool(c, "c"))',
    });
  });
});

describe("parseBody — atoms keep their JS", () => {
  it("treats a call with commas as one atom", () => {
    expect(lo("f(x, y) !== 0")).toEqual({
      preconditions: [],
      body: '__bool(f(x, y) !== 0, "f(x, y) !== 0")',
    });
  });
  it("allows nested && inside a callback leaf", () => {
    expect(lo("xs.every(x => x > 0 && x < 10)")).toEqual({
      preconditions: [],
      body: '__bool(xs.every(x => x > 0 && x < 10), "xs.every(x => x > 0 && x < 10)")',
    });
  });
});

describe("parseBody — errors", () => {
  it("rejects a chained ↔", () => {
    expectPabstError(() => parseBody("a ↔ b ↔ c"), /parenthesi[sz]e/i);
  });
  it("rejects a top-level JS && with a glyph hint", () => {
    expectPabstError(() => parseBody("a && b"), /use ∧/);
  });
  it("rejects a top-level JS || with a glyph hint", () => {
    expectPabstError(() => parseBody("a || b"), /use ∨/);
  });
  it("rejects a top-level prefix ! with a glyph hint", () => {
    expectPabstError(() => parseBody("!p"), /use ¬/);
  });
  it("rejects an empty operand", () => {
    expectPabstError(() => parseBody("a ∧ "), /empty/i);
  });
});
