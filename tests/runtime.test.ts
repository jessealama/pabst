import { describe, it, expect } from "vitest";
import { report, bool } from "../src/runtime.js";
import { parseIssue, type Issue } from "../src/issue.js";

function thrownIssue(fn: () => void): Issue {
  let msg = "";
  try {
    fn();
  } catch (e) {
    msg = (e as Error).message;
  }
  const issue = parseIssue(msg);
  expect(issue).not.toBeNull();
  return issue!;
}

describe("runtime report", () => {
  it("does nothing when the run did not fail", () => {
    expect(() =>
      report("f.ts", "f", "p", ["x"], { failed: false, counterexample: null }),
    ).not.toThrow();
  });

  it("emits a falsified issue with the counterexample bound to binder names", () => {
    const issue = thrownIssue(() =>
      report("f.ts", "f", "wrong", ["x"], {
        failed: true,
        counterexample: [1],
        errorInstance: { message: "Property failed by returning false" },
      }),
    );
    expect(issue).toEqual({
      file: "f.ts",
      function: "f",
      property: "wrong",
      kind: "falsified",
      counterexample: { x: 1 },
    });
  });

  it("binds multiple binders in order", () => {
    const issue = thrownIssue(() =>
      report("f.ts", "f", "p", ["a", "b"], {
        failed: true,
        counterexample: [2, "hi"],
        errorInstance: null,
      }),
    );
    expect(issue.counterexample).toEqual({ a: 2, b: "hi" });
    expect(issue.kind).toBe("falsified");
  });

  it("emits a threw issue with the underlying error message", () => {
    const issue = thrownIssue(() =>
      report("f.ts", "f", "boom", ["x"], {
        failed: true,
        counterexample: [1],
        errorInstance: { message: "kaboom at 1" },
      }),
    );
    expect(issue.kind).toBe("threw");
    expect(issue.error).toBe("kaboom at 1");
    expect(issue.counterexample).toEqual({ x: 1 });
  });

  it("emits an exhausted issue when there is no counterexample", () => {
    const issue = thrownIssue(() =>
      report("f.ts", "f", "p", ["x"], {
        failed: true,
        counterexample: null,
        errorInstance: null,
      }),
    );
    expect(issue.kind).toBe("exhausted");
    expect(issue.error).toBe("too many skipped runs");
    expect(issue.counterexample).toBeUndefined();
  });

  it("encodes bigint counterexamples as fast-check strings", () => {
    const issue = thrownIssue(() =>
      report("f.ts", "f", "p", ["n"], {
        failed: true,
        counterexample: [10n],
        errorInstance: null,
      }),
    );
    expect(issue.counterexample).toEqual({ n: "10n" });
  });

  it("encodes non-finite numbers as strings", () => {
    const issue = thrownIssue(() =>
      report("f.ts", "f", "p", ["d"], {
        failed: true,
        counterexample: [Number.NaN],
        errorInstance: null,
      }),
    );
    expect(typeof issue.counterexample!.d).toBe("string");
  });
});

describe("bool — per-atom boolean enforcement", () => {
  it("returns true/false unchanged", () => {
    expect(bool(true, "p(x)")).toBe(true);
    expect(bool(false, "p(x)")).toBe(false);
  });

  it("throws naming the atom and the non-boolean value", () => {
    expect(() => bool(5, "f(x)")).toThrow(
      /atom "f\(x\)" evaluated to 5, not a boolean/,
    );
    expect(() => bool(undefined, "g()")).toThrow(
      /atom "g\(\)" evaluated to undefined, not a boolean/,
    );
  });

  it("does not coerce truthy/falsy values", () => {
    expect(() => bool(0, "n")).toThrow(/not a boolean/);
    expect(() => bool("", "s")).toThrow(/not a boolean/);
  });
});
