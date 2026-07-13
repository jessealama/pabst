import { describe, it, expect } from "vitest";
import { desugarEquations } from "../src/equations.js";
import { PabstError } from "../src/errors.js";

const throws = (input: string, re: RegExp) => {
  expect(() => desugarEquations(input)).toThrowError(PabstError);
  expect(() => desugarEquations(input)).toThrowError(re);
};

describe("desugarEquations — rewrites", () => {
  it("rewrites ≡ to Object.is", () => {
    expect(desugarEquations("x ≡ y")).toBe("Object.is(x, y)");
  });
  it("handles an LHS that is not a valid JS assignment target", () => {
    expect(desugarEquations("x + 0 ≡ x")).toBe("Object.is(x + 0, x)");
    expect(desugarEquations('typeof x ≡ "number"')).toBe(
      'Object.is(typeof x, "number")',
    );
  });
  it("rewrites ≢ to !Object.is", () => {
    expect(desugarEquations("x ≢ y")).toBe("!Object.is(x, y)");
    expect(desugarEquations("x ≢ -0")).toBe("!Object.is(x, -0)");
  });
  it("preserves operand formatting", () => {
    expect(desugarEquations("f( a , b ) ≡ c")).toBe("Object.is(f( a , b ), c)");
  });
  it("leaves glyphs in template text untouched while rewriting the outer ≡", () => {
    expect(desugarEquations("s ≡ `${x} ≡ ${y}`")).toBe(
      "Object.is(s, `${x} ≡ ${y}`)",
    );
    expect(desugarEquations("t ≡ `${a} ≢ ${b}`")).toBe(
      "Object.is(t, `${a} ≢ ${b}`)",
    );
  });
  it("treats / after this, true, postfix ++, and a template tail as division", () => {
    expect(desugarEquations("this / a ≡ b / c")).toBe(
      "Object.is(this / a, b / c)",
    );
    expect(desugarEquations("i++ / n ≡ x / d")).toBe(
      "Object.is(i++ / n, x / d)",
    );
    expect(desugarEquations("true / a ≡ b / c")).toBe(
      "Object.is(true / a, b / c)",
    );
    expect(desugarEquations("`${x}` / a ≡ b / c")).toBe(
      "Object.is(`${x}` / a, b / c)",
    );
  });
});

describe("desugarEquations — ≡ is top-level only", () => {
  it("rejects a nested equation with an Object.is hint", () => {
    throws("xs.every(x => x ≡ 0)", /top level.*Object\.is/s);
    throws("xs.every(x => x ≢ 0)", /top level.*Object\.is/s);
    throws("xs.some(x => !(x ≡ 0))", /top level.*Object\.is/s);
    throws("f(a ≡ b) ≡ c", /top level.*Object\.is/s);
    throws("flag ≡ (x ≡ y)", /top level.*Object\.is/s);
    throws("s ≡ `v: ${x ≡ y}`", /top level.*Object\.is/s);
    throws("s ≡ `a${ `b${x ≡ y}` }d`", /top level.*Object\.is/s);
  });
  it("accepts an explicit Object.is in the nested position instead", () => {
    expect(desugarEquations("xs.every(x => Object.is(x, 0))")).toBe(
      "xs.every(x => Object.is(x, 0))",
    );
  });
  it("accepts TypeScript expression syntax in atoms (islands are JS/TS)", () => {
    expect(desugarEquations("(x as unknown as number) ≡ y")).toBe(
      "Object.is((x as unknown as number), y)",
    );
    expect(desugarEquations("xs!.length ≡ n")).toBe("Object.is(xs!.length, n)");
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
  it("returns an explicit Object.is call unchanged", () => {
    expect(desugarEquations("Object.is(a, b)")).toBe("Object.is(a, b)");
    expect(desugarEquations("xs.every(x => !Object.is(x, -0))")).toBe(
      "xs.every(x => !Object.is(x, -0))",
    );
  });
  it("does not mistake >= (scanned as > then =) for an assignment", () => {
    expect(desugarEquations("x >= y")).toBe("x >= y");
    expect(desugarEquations("f(x) >= 0")).toBe("f(x) >= 0");
    expect(desugarEquations("x >>> 2")).toBe("x >>> 2");
  });
  it("keeps >= intact inside a real equation", () => {
    expect(desugarEquations("x >= 1 ≡ flag")).toBe("Object.is(x >= 1, flag)");
  });
  it("does not touch =, ≡, ≢, or ≠ inside string literals", () => {
    expect(desugarEquations('s ≡ "a = b"')).toBe('Object.is(s, "a = b")');
    expect(desugarEquations('s ≡ "≠"')).toBe('Object.is(s, "≠")');
    expect(desugarEquations('s ≡ "≡ ≢"')).toBe('Object.is(s, "≡ ≢")');
  });
  it("does not touch glyphs in template text after a substitution", () => {
    expect(desugarEquations("s === `${x} ≡ ${y}`")).toBe("s === `${x} ≡ ${y}`");
    expect(desugarEquations("t === `${a} ≠ ${b}`")).toBe("t === `${a} ≠ ${b}`");
  });
  it("does not end template mode at a } that closes a brace inside a substitution", () => {
    expect(desugarEquations("s === `${ {a: 1} } ≡ ${y}`")).toBe(
      "s === `${ {a: 1} } ≡ ${y}`",
    );
  });
  it("allows default-parameter initializers (not assignments)", () => {
    expect(desugarEquations("((x = 1) => x)(0) ≡ 1")).toBe(
      "Object.is(((x = 1) => x)(0), 1)",
    );
    expect(desugarEquations("xs.every((x, d = 1) => x > d)")).toBe(
      "xs.every((x, d = 1) => x > d)",
    );
  });
});

describe("desugarEquations — rejections", () => {
  it("bans loose equality == at any depth", () => {
    throws("x == y", /loose equality/);
    throws("xs.every(x => x == 0)", /loose equality/);
  });
  it("the == ban names both replacements and the offending atom", () => {
    throws("x == y", /use ≡ .*Object\.is.*===/);
    throws("x == y", /x == y/);
  });
  it("bans loose inequality != at any depth", () => {
    throws("x != y", /loose inequality/);
    throws("xs.every(x => x != 0)", /loose inequality/);
    throws("x != y", /use ≢ .*!==/);
  });
  it("bans plain = assignment at any depth", () => {
    throws("x = 0", /JS assignment/);
    throws("xs.every(x => x = 0)", /JS assignment/);
    throws("flag = (x ≡ y)", /JS assignment/);
    throws("x = 0", /write A ≡ B/);
  });
  it("hints ≡ when the = atom cannot even parse as JS", () => {
    throws("x + 0 = x", /JS assignment/);
    throws('typeof x = "number"', /write A ≡ B/);
  });
  it("bans compound assignments at any depth", () => {
    throws("x += 1", /assignments are not allowed/);
    throws("x ||= y", /assignments are not allowed/);
    throws("x >>= 2", /assignments are not allowed/);
    throws("x >>>= 2", /assignments are not allowed/);
    throws(
      "xs.reduce((n, x) => ((n += x), n), 0) > 0",
      /assignments are not allowed/,
    );
  });
  it("rejects an equation glyph fused with an adjacent =", () => {
    throws("a ≡= b", /fused with an adjacent operator/);
    throws("a =≡ b", /fused with an adjacent operator/);
    throws("a ≢= b", /fused with an adjacent operator/);
  });
  it("rejects an equation glyph fused with an adjacent !", () => {
    throws("a !≡ b", /fused with an adjacent operator/);
  });
  it("accepts a spaced non-null assertion beside a glyph", () => {
    expect(desugarEquations("a! ≡ b")).toBe("Object.is(a!, b)");
  });
  it("rejects ≠ with a hint to ≢", () => {
    throws("a ≠ b", /write ≢/);
    throws("a ≠ b", /a ≠ b/);
  });
  it("rejects chained equations", () => {
    throws("a ≡ b ≡ c", /chained equations/);
    throws("a ≢ b ≢ c", /chained equations/);
    throws("a ≡ b ≢ c", /chained equations/);
    throws("a ≡ b === c", /chained equations/);
    throws("a === b ≡ c", /chained equations/);
  });
  it("does not reject pure ===/!== chains (untouched JS)", () => {
    expect(desugarEquations("a === b !== c")).toBe("a === b !== c");
  });
  it("rejects && and || surfaced at the atom root by ≡ precedence", () => {
    throws("a ≡ b && c", /use ∧/);
    throws("a ≡ b || c", /use ∨/);
  });
  it("rejects ?? regrouped to the atom root by ≡ precedence", () => {
    throws("a ≡ b ?? c", /binds tighter than \?\?/);
  });
  it("rejects ?? beside an equation", () => {
    throws("a ?? b ≡ c", /never nullish/);
    throws("(a ≡ b) ?? c", /top level.*Object\.is/s);
  });
  it("rejects a nested equation even beside ??", () => {
    throws("f(a ≡ b ?? c)", /top level.*Object\.is/s);
    throws("f(a ≡ b) ?? c", /top level.*Object\.is/s);
  });
  it("allows a ?? whose left operand is not an equation", () => {
    expect(desugarEquations("a ≡ (b ?? c)")).toBe("Object.is(a, (b ?? c))");
    expect(desugarEquations("f(x ?? y) ≡ z")).toBe("Object.is(f(x ?? y), z)");
  });
  it("allows root-level ?? when the atom has no equation", () => {
    expect(desugarEquations("((x = 1) => x)(0) ?? true")).toBe(
      "((x = 1) => x)(0) ?? true",
    );
  });
  it("rejects an equation beside an unparenthesized ternary", () => {
    throws("a ≡ b ? c : d", /unparenthesized ternary/);
    throws("a ≢ b ? c : d", /unparenthesized ternary/);
    throws("flag ? x ≡ 1 : y ≡ 2", /unparenthesized ternary/);
  });
  it("allows a wholly-parenthesized ternary as an equation side", () => {
    expect(desugarEquations("a ≡ (b ? c : d)")).toBe(
      "Object.is(a, (b ? c : d))",
    );
  });
  it("rejects an equation beside a depth-0 comma", () => {
    throws("a, b ≡ x", /comma/);
    throws("a ≡ b, c", /comma/);
  });
  it("rejects an equation beside an unparenthesized arrow function", () => {
    throws("p ≡ x => f(x)", /arrow/);
    throws("x => y ≡ b", /arrow/);
  });
  it("allows a parenthesized arrow and comma as equation material", () => {
    expect(desugarEquations("f() ≡ (x => x)(0)")).toBe(
      "Object.is(f(), (x => x)(0))",
    );
    expect(desugarEquations("g(a, b) ≡ x")).toBe("Object.is(g(a, b), x)");
  });
  it("allows && and || under a depth-0 ternary (the ternary is the root)", () => {
    expect(desugarEquations("a && b ? c : d")).toBe("a && b ? c : d");
    expect(desugarEquations("cond ? a : b && c")).toBe("cond ? a : b && c");
    expect(desugarEquations("a || b ? c : d")).toBe("a || b ? c : d");
  });
  it("rejects && / || at the atom root, even parenthesized", () => {
    throws("a && b", /use ∧/);
    throws("a || b", /use ∨/);
    throws("(a && b)", /use ∧/);
  });
  it("rejects a parenthesized equation feeding a ternary (nested position)", () => {
    throws("(a ≡ b) ? c : d", /top level.*Object\.is/s);
    throws("(x ≢ y) ? c : d", /top level.*Object\.is/s);
  });
});
