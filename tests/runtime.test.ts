import { describe, it, expect } from "vitest";
import { report } from "../src/runtime.js";

describe("runtime report", () => {
  it("does nothing when the run did not fail", () => {
    expect(() => report("p", ["x"], { failed: false, counterexample: null })).not.toThrow();
  });

  it("binds the counterexample to binder names on a returns-false failure", () => {
    expect(() =>
      report("wrong", ["x"], {
        failed: true,
        counterexample: [1],
        errorInstance: { message: "Property failed by returning false" },
      }),
    ).toThrow("property 'wrong' falsified by x = 1");
  });

  it("binds multiple binders in order", () => {
    let msg = "";
    try {
      report("p", ["a", "b"], { failed: true, counterexample: [2, "hi"], errorInstance: null });
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toBe('property \'p\' falsified by a = 2, b = "hi"');
  });

  it("appends the underlying error when the body threw", () => {
    expect(() =>
      report("nothrow", ["x"], {
        failed: true,
        counterexample: [1],
        errorInstance: { message: "kaboom at 1" },
      }),
    ).toThrow("property 'nothrow' falsified by x = 1\n  kaboom at 1");
  });

  it("reports a skip-exhaustion failure when there is no counterexample", () => {
    expect(() =>
      report("p", ["x"], { failed: true, counterexample: null, errorInstance: null }),
    ).toThrow("property 'p' failed: too many skipped runs");
  });
});
