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
  const out = emit([spec], "foo.ts", ".pabst/foo.pabst.test.ts", 42);

  it("imports vitest + @fast-check/vitest and the module", () => {
    expect(out).toContain('import { describe } from "vitest";');
    expect(out).toContain('import { test, fc } from "@fast-check/vitest";');
    expect(out).toContain('import * as __M from "../foo";');
    expect(out).toContain("const { foo } = __M;");
  });

  it("emits the describe hierarchy and test.prop with arbitraries", () => {
    expect(out).toContain('describe("pabst", () => {');
    expect(out).toContain('describe("foo", () => {');
    expect(out).toContain('test.prop([fc.integer(), fc.double()], { seed: 42, reporter: (d) => __pabstReport("foo.ts", "foo", "nonzero", ["x", "y"], d) })("nonzero", (x, y) => {');
  });

  it("lifts preconditions, checks boolean, returns the body", () => {
    expect(out).toContain("fc.pre(Math.isInteger(y));");
    expect(out).toContain("const __r = (foo(x, y) !== 0);");
    expect(out).toContain('if (typeof __r !== "boolean") throw new Error("property \'nonzero\' did not evaluate to a boolean");');
    expect(out).toContain("return __r;");
  });

  it("passes a reporter that names the property and binds the counterexample", () => {
    expect(out).toContain('test.prop([fc.integer(), fc.double()], { seed: 42, reporter: (d) => __pabstReport("foo.ts", "foo", "nonzero", ["x", "y"], d) })("nonzero", (x, y) => {');
  });

  it("imports the reporter from the runtime library once", () => {
    expect(out).toContain('import { report as __pabstReport } from "pabst/runtime";');
    // no inline copy of the helper
    expect(out).not.toContain("function __pabstReport(");
    // a single import, no matter how many properties
    const multi = emit([spec, { ...spec, name: "other" }], "foo.ts", ".pabst/foo.pabst.test.ts", 42);
    const occurrences = multi.split('from "pabst/runtime"').length - 1;
    expect(occurrences).toBe(1);
  });
});

const instanceSpec: PropertySpec = {
  name: "incAddsOne",
  functionName: "inc",
  className: "Counter",
  isStatic: false,
  binders: [{ varName: "x", domain: "int" }],
  body: "new Counter(x).inc().value === x + 1",
  preconditions: [],
  freeExports: ["Counter"],
  location: { file: "counter.ts", line: 1 },
};

const staticSpec: PropertySpec = {
  name: "matchesSubtraction",
  functionName: "negate",
  className: "Arith",
  isStatic: true,
  binders: [{ varName: "x", domain: "number" }],
  body: "Object.is(Arith.negate(x), 0 - x)",
  preconditions: [],
  freeExports: ["Arith"],
  location: { file: "arith.ts", line: 1 },
};

describe("emit — class methods", () => {
  it("nests describe(class) > describe(method) for an instance method", () => {
    const out = emit([instanceSpec], "counter.ts", ".pabst/counter.pabst.test.ts", 7);
    expect(out).toContain('describe("Counter", () => {');
    expect(out).toContain('describe("inc", () => {');
  });

  it("passes the # qualified name to the reporter for an instance method", () => {
    const out = emit([instanceSpec], "counter.ts", ".pabst/counter.pabst.test.ts", 7);
    expect(out).toContain('__pabstReport("counter.ts", "Counter#inc", "incAddsOne", ["x"], d)');
  });

  it("passes the . qualified name to the reporter for a static method", () => {
    const out = emit([staticSpec], "arith.ts", ".pabst/arith.pabst.test.ts", 7);
    expect(out).toContain('describe("Arith", () => {');
    expect(out).toContain('describe("negate", () => {');
    expect(out).toContain('__pabstReport("arith.ts", "Arith.negate", "matchesSubtraction", ["x"], d)');
  });
});
