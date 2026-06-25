import { describe, it, expect } from "vitest";
import { emit } from "../src/emit.js";
import type { PropertySpec } from "../src/ir.js";

const spec: PropertySpec = {
  name: "nonzero",
  functionName: "foo",
  binders: [
    { varName: "x", domain: "int" },
    { varName: "y", domain: "number" },
  ],
  body: "foo(x, y) !== 0",
  preconditions: ["Math.isInteger(y)"],
  freeExports: ["foo"],
  location: { file: "foo.ts", line: 1 },
};

describe("emit", () => {
  const out = emit([spec], "foo.ts", ".pabst/foo.pabst.test.ts");

  it("imports vitest + @fast-check/vitest and the module", () => {
    expect(out).toContain('import { describe } from "vitest";');
    expect(out).toContain('import { test, fc } from "@fast-check/vitest";');
    expect(out).toContain('import * as __M from "../foo";');
    expect(out).toContain("const { foo } = __M;");
  });

  it("emits the describe hierarchy and test.prop with arbitraries", () => {
    expect(out).toContain('describe("pabst", () => {');
    expect(out).toContain('describe("foo", () => {');
    expect(out).toContain('test.prop([fc.integer(), fc.double()])("nonzero", ([x, y]) => {');
  });

  it("lifts preconditions, checks boolean, returns the body", () => {
    expect(out).toContain("fc.pre(Math.isInteger(y));");
    expect(out).toContain("const __r = (foo(x, y) !== 0);");
    expect(out).toContain('if (typeof __r !== "boolean") throw new Error("property \'nonzero\' did not evaluate to a boolean");');
    expect(out).toContain("return __r;");
  });
});
