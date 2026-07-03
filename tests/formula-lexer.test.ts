import { describe, it, expect } from "vitest";
import { lexFormula } from "../src/formula-lexer.js";
import { expectPabstError } from "./helpers/errors.js";

const kinds = (s: string) => lexFormula(s).map((t) => t.kind);
const texts = (s: string) => lexFormula(s).map((t) => t.text);

describe("lexFormula — glyphs", () => {
  it("tags ¬ ∧ ∨ → ↔ as connectives and the rest as js", () => {
    expect(kinds("a ∧ b ∨ c → d ↔ e")).toEqual([
      "js",
      "and",
      "js",
      "or",
      "js",
      "implies",
      "js",
      "iff",
      "js",
    ]);
  });
  it("tags ¬ as not", () => {
    expect(kinds("¬ p")).toEqual(["not", "js"]);
  });
  it("does NOT split a glyph inside a string literal", () => {
    expect(kinds('s === "a ∧ b"')).toEqual(["js", "js", "js"]);
    expect(texts('s === "a ∧ b"')).toEqual(["s", "===", '"a ∧ b"']);
  });
  it("distinguishes !== from a prefix ! (both are js here)", () => {
    expect(kinds("f(x) !== 0")).toEqual([
      "js",
      "open",
      "js",
      "close",
      "js",
      "js",
    ]);
  });
});

describe("lexFormula — ASCII fallbacks", () => {
  it("merges -> and ==> into implies", () => {
    expect(kinds("a -> b")).toEqual(["js", "implies", "js"]);
    expect(kinds("a ==> b")).toEqual(["js", "implies", "js"]);
  });
  it("merges <-> into iff", () => {
    expect(kinds("a <-> b")).toEqual(["js", "iff", "js"]);
  });
  it("does not merge across whitespace gaps", () => {
    // "a - > b" is not an arrow (tokens not adjacent)
    expect(kinds("a - > b")).toEqual(["js", "js", "js", "js"]);
  });
  it("does not mistake x<-1 (less-than minus one) for <->", () => {
    // tokens: x  <  -  1  — no '>' follows, so no iff merge
    expect(kinds("x<-1")).toEqual(["js", "js", "js", "js"]);
  });
});

describe("lexFormula — regex and slash fallbacks", () => {
  it("merges /\\ into and, \\/ into or", () => {
    expect(kinds("a /\\ b")).toEqual(["js", "and", "js"]);
    expect(kinds("a \\/ b")).toEqual(["js", "or", "js"]);
  });
  it("keeps a regex literal as a single js token (does not see /\\ inside it)", () => {
    const t = lexFormula("/\\d+/.test(s)");
    expect(t[0]!.kind).toBe("js");
    expect(t[0]!.text).toBe("/\\d+/");
    expect(kinds("/\\d+/.test(s)")).toEqual([
      "js",
      "js",
      "js",
      "open",
      "js",
      "close",
    ]);
  });
  it("does not treat division as a regex", () => {
    expect(texts("a / b")).toEqual(["a", "/", "b"]);
  });
});

describe("lexFormula — rejected quantifiers", () => {
  it("rejects ∃ / exists with a teaching error", () => {
    expectPabstError(
      () => lexFormula("∃ x, p(x)"),
      /existential quantifiers .* not supported/i,
    );
    expectPabstError(
      () => lexFormula("exists x"),
      /existential quantifiers .* not supported/i,
    );
  });
  it("rejects a nested ∀ / forall in the body", () => {
    expectPabstError(
      () => lexFormula("p ∧ ∀ y"),
      /nested quantifiers are not supported/i,
    );
    expectPabstError(
      () => lexFormula("forall y"),
      /nested quantifiers are not supported/i,
    );
  });
});
