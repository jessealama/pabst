import { describe, it, expect } from "vitest";
import { collectAtoms, type Formula } from "../src/formula-ast.js";

describe("collectAtoms", () => {
  it("collects atom js expressions left-to-right across the tree", () => {
    const f: Formula = {
      kind: "implication",
      antecedents: [
        { kind: "atom", text: "p(x) = 1", js: "Object.is(p(x), 1)" },
      ],
      consequent: {
        kind: "and",
        left: {
          kind: "not",
          arg: { kind: "atom", text: "q(x)", js: "q(x)" },
        },
        right: { kind: "atom", text: "r(x)", js: "r(x)" },
      },
    };
    expect(collectAtoms(f)).toEqual(["Object.is(p(x), 1)", "q(x)", "r(x)"]);
  });
});
