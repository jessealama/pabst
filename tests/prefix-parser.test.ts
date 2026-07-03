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
