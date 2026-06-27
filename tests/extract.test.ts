import { describe, it, expect } from "vitest";
import { extract } from "../src/extract.js";

const FIXTURE = new URL("./fixtures/foo.ts", import.meta.url).pathname;

describe("extract", () => {
  it("reads exported names", () => {
    const r = extract(FIXTURE);
    expect([...r.exports].sort()).toEqual(["foo", "helper"]);
  });

  it("reads the @ensures annotation attached to its function", () => {
    const r = extract(FIXTURE);
    expect(r.annotations).toHaveLength(1);
    const a = r.annotations[0]!;
    expect(a.propertyName).toBe("nonzero");
    expect(a.functionName).toBe("foo");
    expect(a.formula).toContain("forall (x: int) (y: number)");
    expect(a.formula).toContain("foo(x, y) !== 0");
    expect(a.line).toBeGreaterThan(0);
  });
});

const CLASS_OK = new URL("./fixtures/extract/class-ok.ts", import.meta.url).pathname;
const CLASS_PRIVATE = new URL("./fixtures/extract/class-private.ts", import.meta.url).pathname;
const CLASS_ACCESSOR = new URL("./fixtures/extract/class-accessor.ts", import.meta.url).pathname;
const CLASS_UNEXPORTED = new URL("./fixtures/extract/class-unexported.ts", import.meta.url).pathname;
const CLASS_DUP = new URL("./fixtures/extract/class-dup.ts", import.meta.url).pathname;

describe("extract — class methods", () => {
  it("records instance and static method annotations with className/isStatic", () => {
    const r = extract(CLASS_OK);
    const inc = r.annotations.find((a) => a.functionName === "inc")!;
    expect(inc.className).toBe("Counter");
    expect(inc.isStatic).toBe(false);
    expect(inc.propertyName).toBe("incAddsOne");

    const of = r.annotations.find((a) => a.functionName === "of")!;
    expect(of.className).toBe("Counter");
    expect(of.isStatic).toBe(true);
  });

  it("leaves a free function annotation unqualified", () => {
    const r = extract(CLASS_OK);
    const bump = r.annotations.find((a) => a.functionName === "bump")!;
    expect(bump.className).toBeUndefined();
    expect(bump.isStatic).toBeUndefined();
  });

  it("does not collide a method and a free function sharing a property name", () => {
    const r = extract(CLASS_OK);
    // "incAddsOne" appears on both Counter#inc and bump — both are kept
    const both = r.annotations.filter((a) => a.propertyName === "incAddsOne");
    expect(both).toHaveLength(2);
  });

  it("ignores class members without @ensures", () => {
    const r = extract(CLASS_OK);
    expect(r.annotations.some((a) => a.functionName === "value")).toBe(false);
    expect(r.annotations.some((a) => a.functionName === "secret")).toBe(false);
  });

  it("throws on @ensures on a non-public method", () => {
    expect(() => extract(CLASS_PRIVATE)).toThrow(/non-public method 'touch'/);
  });

  it("throws on @ensures on an accessor", () => {
    expect(() => extract(CLASS_ACCESSOR)).toThrow(/unsupported member 'value'/);
  });

  it("throws on @ensures on a method of a non-exported class", () => {
    expect(() => extract(CLASS_UNEXPORTED)).toThrow(/which is not exported/);
  });

  it("throws on a duplicate qualified property name", () => {
    expect(() => extract(CLASS_DUP)).toThrow(/duplicate property name 'p' on method 'Box\.id'/);
  });
});
