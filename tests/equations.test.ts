import { describe, it, expect } from "vitest";
import { desugarEquations } from "../src/equations.js";
import { PabstError } from "../src/errors.js";

describe("desugarEquations — rewrites", () => {
  it("rewrites = to Object.is", () => {
    expect(desugarEquations("x = y")).toBe("Object.is(x, y)");
  });
  it("handles an LHS that is not a valid JS assignment target", () => {
    expect(desugarEquations("x + 0 = x")).toBe("Object.is(x + 0, x)");
    expect(desugarEquations('typeof x = "number"')).toBe(
      'Object.is(typeof x, "number")',
    );
  });
  it("rewrites != and ≠ to !Object.is", () => {
    expect(desugarEquations("x != y")).toBe("!Object.is(x, y)");
    expect(desugarEquations("x ≠ y")).toBe("!Object.is(x, y)");
    expect(desugarEquations("x != -0")).toBe("!Object.is(x, -0)");
  });
  it("rewrites inside callback bodies (uniform depth)", () => {
    expect(desugarEquations("xs.every(x => x = 0)")).toBe(
      "xs.every(x => Object.is(x, 0))",
    );
    expect(desugarEquations("xs.every(x => x != 0)")).toBe(
      "xs.every(x => !Object.is(x, 0))",
    );
  });
  it("rewrites recursively on both sides of an equation", () => {
    expect(desugarEquations("f(a = b) = c")).toBe(
      "Object.is(f(Object.is(a, b)), c)",
    );
  });
  it("allows explicitly parenthesized nesting (user parens preserved)", () => {
    expect(desugarEquations("flag = (x = y)")).toBe(
      "Object.is(flag, (Object.is(x, y)))",
    );
  });
  it("preserves operand formatting", () => {
    expect(desugarEquations("f( a , b ) = c")).toBe("Object.is(f( a , b ), c)");
  });
});

describe("desugarEquations — leaves plain JS alone", () => {
  it("returns equation-free atoms unchanged", () => {
    expect(desugarEquations("f(x, y)")).toBe("f(x, y)");
    expect(desugarEquations("a === b")).toBe("a === b");
    expect(desugarEquations("a !== b")).toBe("a !== b");
    expect(desugarEquations("x <= y")).toBe("x <= y");
    expect(desugarEquations("/=/.test(s)")).toBe("/=/.test(s)");
  });
  it("does not touch = or ≠ inside string literals", () => {
    expect(desugarEquations('s = "a = b"')).toBe('Object.is(s, "a = b")');
    expect(desugarEquations('s = "≠"')).toBe('Object.is(s, "≠")');
  });
});

const throws = (input: string, re: RegExp) => {
  expect(() => desugarEquations(input)).toThrowError(PabstError);
  expect(() => desugarEquations(input)).toThrowError(re);
};

describe("desugarEquations — rejections", () => {
  it("bans loose equality == at any depth", () => {
    throws("x == y", /loose equality/);
    throws("xs.every(x => x == 0)", /loose equality/);
  });
  it("the == ban names both replacements and the offending atom", () => {
    throws("x == y", /use = .*Object\.is.*===/);
    throws("x == y", /x == y/);
  });
  it("rejects chained equations", () => {
    throws("a = b = c", /chained equations/);
    throws("a != b != c", /chained equations/);
    throws("a = b != c", /chained equations/);
    throws("a = b === c", /chained equations/);
    throws("a === b = c", /chained equations/);
  });
  it("does not reject pure ===/!== chains (untouched JS)", () => {
    expect(desugarEquations("a === b !== c")).toBe("a === b !== c");
  });
  it("rejects && and || surfaced at the atom root by = precedence", () => {
    throws("a = b && c", /use ∧/);
    throws("a = b || c", /use ∨/);
  });
  it("rejects atoms the substitution makes unparseable (default params)", () => {
    throws("((x = 1) => x)(0) = 1", /cannot parse atom/);
  });
});
