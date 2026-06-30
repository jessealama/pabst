import { describe, it, expect } from "vitest";
import ts from "typescript";
import { freeIdentifiers, classify } from "../src/free-idents.js";

function exprNode(src: string): ts.Node {
  const sf = ts.createSourceFile("__t.ts", `(${src});`, ts.ScriptTarget.Latest, true);
  return (sf.statements[0] as ts.ExpressionStatement).expression;
}

describe("freeIdentifiers", () => {
  it("collects references but not property names", () => {
    const ids = freeIdentifiers(exprNode("Math.isInteger(y) && foo(x, y) !== 0"));
    expect([...ids].sort()).toEqual(["Math", "foo", "x", "y"]);
  });

  it("excludes object-literal keys but keeps value refs", () => {
    const ids = freeIdentifiers(exprNode("({ a: x }).a === x"));
    expect([...ids].sort()).toEqual(["x"]);
  });

  it("excludes the right side of a qualified type name", () => {
    const ids = freeIdentifiers(exprNode("x as Foo.Bar"));
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

  it("treats implies as a builtin, not a required export", () => {
    const ids = new Set(["x", "implies", "foo"]);
    expect(classify(ids, bound, exports, "nonzero", "foo.ts")).toEqual({ freeExports: ["foo"] });
  });

  it("throws on an unexported, non-global, non-bound identifier", () => {
    const ids = new Set(["x", "bar"]);
    expect(() => classify(ids, bound, exports, "nonzero", "foo.ts")).toThrow(
      "property 'nonzero' references 'bar', which is not exported from foo.ts",
    );
  });
});
