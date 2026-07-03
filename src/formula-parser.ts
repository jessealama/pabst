import ts from "typescript";
import type { Formula } from "./formula-ast.js";
import { lexFormula, type FToken } from "./formula-lexer.js";
import { PabstError } from "./errors.js";

export function parseBody(body: string): Formula {
  const toks = lexFormula(body);
  return parseTokens(toks, body);
}

function parseTokens(toks: FToken[], src: string): Formula {
  if (toks.length === 0)
    throw new PabstError("empty operand: a connective is missing a side");

  // ↔ (loosest, non-associative)
  const iff = splitTop(toks, "iff");
  if (iff.length > 2)
    throw new PabstError(
      "chained ↔ is ambiguous: parenthesize, e.g. (a ↔ b) ↔ c",
    );
  if (iff.length === 2) {
    return {
      kind: "iff",
      left: parseTokens(iff[0]!, src),
      right: parseTokens(iff[1]!, src),
    };
  }

  // → (chain: every segment but the last is an antecedent)
  const imp = splitTop(toks, "implies");
  if (imp.length >= 2) {
    const antecedents = imp.slice(0, -1).map((seg) => parseTokens(seg, src));
    const consequent = parseTokens(imp[imp.length - 1]!, src);
    return { kind: "implication", antecedents, consequent };
  }

  // ∨ then ∧ (left-associative)
  const or = splitTop(toks, "or");
  if (or.length >= 2) return foldBinary("or", or, src);
  const and = splitTop(toks, "and");
  if (and.length >= 2) return foldBinary("and", and, src);

  // ¬ (prefix)
  if (toks[0]!.kind === "not") {
    return { kind: "not", arg: parseTokens(toks.slice(1), src) };
  }

  // primary: a wholly-wrapped ( … ) is logical grouping; otherwise an atom
  if (whollyWrapped(toks)) return parseTokens(toks.slice(1, -1), src);
  return makeAtom(toks, src);
}

function foldBinary(
  kind: "and" | "or",
  segs: FToken[][],
  src: string,
): Formula {
  return segs
    .map((s) => parseTokens(s, src))
    .reduce((left, right) => ({ kind, left, right }));
}

/** Split a token list at depth-0 tokens of `kind` (depth tracks open/close). */
function splitTop(toks: FToken[], kind: FToken["kind"]): FToken[][] {
  const segs: FToken[][] = [];
  let depth = 0;
  let cur: FToken[] = [];
  for (const t of toks) {
    if (t.kind === "open") depth++;
    else if (t.kind === "close") depth--;
    if (depth === 0 && t.kind === kind) {
      segs.push(cur);
      cur = [];
      continue;
    }
    cur.push(t);
  }
  segs.push(cur);
  return segs;
}

/** True when toks[0] is "(" whose match is the final token. */
function whollyWrapped(toks: FToken[]): boolean {
  if (toks.length < 2 || toks[0]!.kind !== "open" || toks[0]!.text !== "(")
    return false;
  let depth = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.kind === "open") depth++;
    else if (t.kind === "close") {
      depth--;
      if (depth === 0) return i === toks.length - 1;
    }
  }
  return false;
}

function makeAtom(toks: FToken[], src: string): Formula {
  const text = src.slice(toks[0]!.start, toks[toks.length - 1]!.end).trim();
  if (text.length === 0)
    throw new PabstError("empty operand: a connective is missing a side");
  enforceLeafRule(text);
  return { kind: "atom", text };
}

/** Reject a leaf whose TOP-LEVEL node is JS &&, ||, or prefix !. Nested uses are fine. */
function enforceLeafRule(text: string): void {
  const sf = ts.createSourceFile(
    "__atom.ts",
    `(${text});`,
    ts.ScriptTarget.Latest,
    true,
  );
  const stmt = sf.statements[0];
  if (!stmt || !ts.isExpressionStatement(stmt)) return;
  let expr: ts.Expression = stmt.expression;
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
  if (ts.isBinaryExpression(expr)) {
    if (expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      throw new PabstError(
        `use ∧ for conjunction at the property's top level, not JS && (in: ${text})`,
      );
    }
    if (expr.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      throw new PabstError(
        `use ∨ for disjunction at the property's top level, not JS || (in: ${text})`,
      );
    }
  }
  if (
    ts.isPrefixUnaryExpression(expr) &&
    expr.operator === ts.SyntaxKind.ExclamationToken
  ) {
    throw new PabstError(
      `use ¬ for negation at the property's top level, not JS ! (in: ${text})`,
    );
  }
}
