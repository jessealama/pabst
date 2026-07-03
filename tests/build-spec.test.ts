import { describe, it, expect } from "vitest";
import { buildSpecs } from "../src/build-spec.js";
import { PabstError } from "../src/errors.js";

const FIXTURE = new URL("./fixtures/e2e/readme-example.ts", import.meta.url)
  .pathname;

describe("buildSpecs", () => {
  it("produces a PropertySpec for the README's worked example", () => {
    const specs = buildSpecs(FIXTURE);
    expect(specs).toHaveLength(1);
    const s = specs[0]!;
    expect(s.name).toBe("nonzero");
    expect(s.functionName).toBe("foo");
    expect(s.binders).toEqual([
      { varName: "x", domain: "bigint" },
      { varName: "y", domain: "number" },
    ]);
    expect(s.preconditions).toEqual([
      '__bool(Number.isInteger(y), "Number.isInteger(y)")',
    ]);
    expect(s.body).toBe('__bool(foo(x, y) !== 0, "foo(x, y) !== 0")');
    expect(s.freeExports).toEqual(["foo"]);
    expect(s.location.line).toBeGreaterThan(0);
  });
});

const BAD_PREFIX = new URL(
  "./fixtures/build-spec/bad-prefix.ts",
  import.meta.url,
).pathname;

describe("buildSpecs — per-annotation diagnostics", () => {
  it("wraps a PabstError with file:line/@ensures{name} and keeps the original as cause", () => {
    let err: unknown;
    try {
      buildSpecs(BAD_PREFIX);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(PabstError);
    const wrapped = err as PabstError;
    expect(wrapped.message).toMatch(
      /bad-prefix\.ts:1: @ensures\{shapely\}: expected 'forall'/,
    );
    // The rewrap must not lose the original error: its stack points at the
    // actual throw site, not at the rewrap line.
    expect(wrapped.cause).toBeInstanceOf(PabstError);
    expect((wrapped.cause as Error).message).toMatch(/^expected 'forall'/);
  });
});

const CLASS_OK = new URL("./fixtures/extract/class-ok.ts", import.meta.url)
  .pathname;

describe("buildSpecs — class methods", () => {
  it("carries className and isStatic onto the spec", () => {
    const specs = buildSpecs(CLASS_OK);
    const inc = specs.find((s) => s.functionName === "inc")!;
    expect(inc.className).toBe("Counter");
    expect(inc.isStatic).toBe(false);

    const of = specs.find((s) => s.functionName === "of")!;
    expect(of.className).toBe("Counter");
    expect(of.isStatic).toBe(true);

    const bump = specs.find((s) => s.functionName === "bump")!;
    expect(bump.className).toBeUndefined();
  });
});
