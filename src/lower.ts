import { BOOL_ALIAS } from "./contract.js";
import type { Formula } from "./formula-ast.js";

/** A pure boolean expression string for any sub-formula (implication = material). */
export function lowerExpr(f: Formula): string {
  switch (f.kind) {
    case "atom":
      return `${BOOL_ALIAS}(${f.js}, ${JSON.stringify(f.text)})`;
    case "not":
      return `!(${lowerExpr(f.arg)})`;
    case "and":
      return `(${lowerExpr(f.left)} && ${lowerExpr(f.right)})`;
    case "or":
      return `(${lowerExpr(f.left)} || ${lowerExpr(f.right)})`;
    case "iff":
      return `(${lowerExpr(f.left)} === ${lowerExpr(f.right)})`;
    case "implication":
      return materialImplication(f.antecedents, f.consequent);
  }
}

function materialImplication(
  antecedents: Formula[],
  consequent: Formula,
): string {
  if (antecedents.length === 0) return lowerExpr(consequent);
  const [head, ...rest] = antecedents;
  return `(!(${lowerExpr(head!)}) || ${materialImplication(rest, consequent)})`;
}

/**
 * Lower the body root. A top-level implication's antecedents become fc.pre(...)
 * discards (QuickCheck conditional-property semantics); everything else is one
 * boolean expression. NOTE: ↔ never reaches here as a precondition — only `→`.
 */
export function lowerTop(f: Formula): {
  preconditions: string[];
  body: string;
} {
  if (f.kind === "implication") {
    return {
      preconditions: f.antecedents.map(lowerExpr),
      body: lowerExpr(f.consequent),
    };
  }
  return { preconditions: [], body: lowerExpr(f) };
}
