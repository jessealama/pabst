import { describe, it, expect } from "vitest";
import { parsePrefix } from "../src/prefix-parser.js";
import { expectPabstError } from "./helpers/errors.js";

describe("parsePrefix — errors", () => {
  it("throws when no comma separates the binders from the body", () => {
    expectPabstError(
      () => parsePrefix("forall (x: int) foo(x)"),
      /expected ',' separating binders from body/,
    );
  });

  it("throws on an unbalanced binder group", () => {
    expectPabstError(
      () => parsePrefix("forall (x: int, x === x"),
      /unbalanced parentheses in binder group/,
    );
  });

  it("throws on an empty body", () => {
    expectPabstError(
      () => parsePrefix("forall (x: int),"),
      /property body is empty/,
    );
  });

  it("throws on a binder group without ':'", () => {
    expectPabstError(
      () => parsePrefix("forall (x int), x === x"),
      /binder group missing ':'/,
    );
  });

  it("throws on a binder group without variable names", () => {
    expectPabstError(
      () => parsePrefix("forall (: int), x === x"),
      /binder group has no variable names/,
    );
  });

  it("throws on an invalid binder variable name", () => {
    expectPabstError(
      () => parsePrefix("forall (x-y: int), x === x"),
      /invalid binder variable name/,
    );
  });
});

describe("parsePrefix", () => {
  it("parses multiple binder groups and the body", () => {
    const r = parsePrefix("forall (x: int) (y: number), foo(x, y) !== 0");
    expect(r.binders).toEqual([
      { varName: "x", domain: "int" },
      { varName: "y", domain: "number" },
    ]);
    expect(r.body).toBe("foo(x, y) !== 0");
  });

  it("supports Lean-style multi-var grouping", () => {
    const r = parsePrefix("forall (x y: int), x + y === y + x");
    expect(r.binders).toEqual([
      { varName: "x", domain: "int" },
      { varName: "y", domain: "int" },
    ]);
    expect(r.body).toBe("x + y === y + x");
  });

  it("accepts the Unicode ∀ form", () => {
    const r = parsePrefix("∀ (n: nat), n >= 0");
    expect(r.binders).toEqual([{ varName: "n", domain: "nat" }]);
    expect(r.body).toBe("n >= 0");
  });

  it("splits prefix from body at the first depth-0 comma, ignoring call commas", () => {
    const r = parsePrefix("forall (x: int), f(x, x) === g(x, x)");
    expect(r.binders).toEqual([{ varName: "x", domain: "int" }]);
    expect(r.body).toBe("f(x, x) === g(x, x)");
  });

  it("rejects an unknown domain", () => {
    expectPabstError(
      () => parsePrefix("forall (x: float), x === x"),
      /unknown generation domain 'float'/,
    );
  });

  it("requires forall", () => {
    expectPabstError(() => parsePrefix("(x: int), x === x"), /forall/);
  });

  it("requires at least one binder group", () => {
    expectPabstError(() => parsePrefix("forall , x === x"), /binder group/);
  });
});

describe("parsePrefix — existential", () => {
  it("rejects a leading ∃ / exists with a teaching error", () => {
    expectPabstError(
      () => parsePrefix("∃ (x: int), p(x)"),
      /existential quantifiers .* not supported/i,
    );
    expectPabstError(
      () => parsePrefix("exists (x: int), p(x)"),
      /existential quantifiers .* not supported/i,
    );
  });
});

describe("parsePrefix — interval constraints", () => {
  it("parses ∈ with a closed interval", () => {
    const r = parsePrefix("forall (x: int ∈ [1, 30]), x <= 30");
    expect(r.binders).toEqual([
      { varName: "x", domain: "int", range: { min: "1", max: "30" } },
    ]);
    expect(r.body).toBe("x <= 30");
  });

  it("parses the ASCII 'in' fallback", () => {
    const r = parsePrefix("forall (x: int in [1, 30]), x <= 30");
    expect(r.binders).toEqual([
      { varName: "x", domain: "int", range: { min: "1", max: "30" } },
    ]);
  });

  it("applies the interval to every name in a Lean-style group", () => {
    const r = parsePrefix("forall (x y: int ∈ [1, 30]), x + y >= 2");
    expect(r.binders).toEqual([
      { varName: "x", domain: "int", range: { min: "1", max: "30" } },
      { varName: "y", domain: "int", range: { min: "1", max: "30" } },
    ]);
  });

  it("mixes ranged and unranged binder groups", () => {
    const r = parsePrefix(
      "forall (x: int ∈ [1, 30]) (s: string), f(x, s) === true",
    );
    expect(r.binders).toEqual([
      { varName: "x", domain: "int", range: { min: "1", max: "30" } },
      { varName: "s", domain: "string" },
    ]);
  });

  it("parses a number interval with decimal endpoints", () => {
    const r = parsePrefix("forall (x: number ∈ [0.5, 1e6]), x > 0");
    expect(r.binders).toEqual([
      { varName: "x", domain: "number", range: { min: "0.5", max: "1e6" } },
    ]);
  });

  it("does not mistake the 'in' inside 'bigint' for the membership keyword", () => {
    const r = parsePrefix("forall (b: bigint), b === b");
    expect(r.binders).toEqual([{ varName: "b", domain: "bigint" }]);
  });

  it("rejects an interval on a non-numeric domain", () => {
    expectPabstError(
      () => parsePrefix("forall (s: string ∈ [1, 30]), s === s"),
      /does not support ∈/,
    );
  });

  it("rejects an inverted interval", () => {
    expectPabstError(
      () => parsePrefix("forall (x: int ∈ [30, 1]), x === x"),
      /empty interval/,
    );
  });

  it("still rejects an unknown domain when an interval is attached", () => {
    expectPabstError(
      () => parsePrefix("forall (x: float ∈ [1, 30]), x === x"),
      /unknown generation domain 'float'/,
    );
  });

  it("reports a missing close delimiter for a half-open '[lo, hi)' (until the scanner learns intervals)", () => {
    expectPabstError(
      () => parsePrefix("forall (x: int ∈ [1, 30)), x === x"),
      /missing its closing/,
    );
  });

  it("hints about open intervals when '(lo, hi]' unbalances the group", () => {
    expectPabstError(
      () => parsePrefix("forall (x: number ∈ (0, 1]), x > 0"),
      /open\/half-open intervals/,
    );
  });

  it("does not hint about open intervals when 'in (' is just body text", () => {
    let message = "";
    try {
      parsePrefix("forall (x: int, contains(x) && x in (whatever");
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/unbalanced parentheses/);
    expect(message).not.toMatch(/open\/half-open/);
  });
});
