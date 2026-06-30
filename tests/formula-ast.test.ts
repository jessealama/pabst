import { describe, it, expect } from "vitest";
import { collectAtoms, type Formula } from "../src/formula-ast.js";

describe("collectAtoms", () => {
  it("collects atom texts left-to-right across the tree", () => {
    const f: Formula = {
      kind: "implication",
      antecedents: [{ kind: "atom", text: "p(x)" }],
      consequent: {
        kind: "and",
        left: { kind: "not", arg: { kind: "atom", text: "q(x)" } },
        right: { kind: "atom", text: "r(x)" },
      },
    };
    expect(collectAtoms(f)).toEqual(["p(x)", "q(x)", "r(x)"]);
  });
});
