import ts from "typescript";
import { PabstError } from "./errors.js";
import { scanTokens } from "./formula-lexer.js";

/** Node offsets in the parsed file are parseText offsets + 1 (leading paren). */
const WRAP = 1;

/**
 * Validate an atom's JS and desugar equations (see README, "Equations"):
 * returns executable JS with `A ≡ B` → `Object.is(A, B)` and `A ≢ B` →
 * `!Object.is(A, B)`, throwing PabstError on the rejected forms.
 */
export function desugarEquations(text: string): string {
  const { parseText, equationOffsets, needsParse, sawAssignEquals } =
    substitute(text);
  const sf = ts.createSourceFile(
    "__atom.ts",
    `(${parseText});`,
    ts.ScriptTarget.Latest,
    true,
  );
  const stmt = sf.statements[0];
  const diags = (sf as unknown as { parseDiagnostics: readonly unknown[] })
    .parseDiagnostics;
  const root =
    stmt &&
    ts.isExpressionStatement(stmt) &&
    ts.isParenthesizedExpression(stmt.expression)
      ? stmt.expression.expression
      : null;
  if (!root || diags.length > 0) {
    if (needsParse) {
      throw new PabstError(
        sawAssignEquals
          ? assignmentMessage(text)
          : `cannot parse atom: ${text}`,
      );
    }
    // No equation material and not TS-parseable: leave the atom for the
    // generated test code to diagnose.
    if (root) enforceLeafRule(root, equationOffsets.size > 0, text);
    return text;
  }
  enforceLeafRule(root, equationOffsets.size > 0, text);
  checkTree(sf, equationOffsets, text);
  banRootNullishOverEquation(root, sf, equationOffsets, text);
  return equationOffsets.size > 0 ? rewrite(root, sf) : text;
}

function assignmentMessage(original: string): string {
  return (
    `= is JS assignment, and assignments are not allowed in a formula atom: ` +
    `if you meant equality, write A ≡ B for identity (Object.is), or call ` +
    `Object.is(A, B) directly (in: ${original})`
  );
}

interface Substitution {
  /** The atom with `≡` → `==` and `≢` → `!=` at the token level. */
  parseText: string;
  /** Offsets in parseText of `==` / `!=` tokens the user wrote as glyphs. */
  equationOffsets: Set<number>;
  /** Whether the atom contains equation or assignment material at all. */
  needsParse: boolean;
  /** Whether a plain `=` (JS assignment) token was seen. */
  sawAssignEquals: boolean;
}

function substitute(text: string): Substitution {
  let out = "";
  let consumed = 0;
  const equationOffsets = new Set<number>();
  let needsParse = false;
  let sawAssignEquals = false;
  for (const token of scanTokens(text)) {
    if (token.text === "≡" || token.text === "≢") {
      out += text.slice(consumed, token.start);
      equationOffsets.add(out.length);
      out += token.text === "≡" ? "==" : "!=";
      consumed = token.end;
      needsParse = true;
    } else if (token.text === "≠") {
      throw new PabstError(
        `≠ is not pabst syntax: write ≢ for negated identity (in: ${text})`,
      );
    } else if (
      token.kind >= ts.SyntaxKind.FirstAssignment &&
      token.kind <= ts.SyntaxKind.LastAssignment
    ) {
      if (token.kind === ts.SyntaxKind.EqualsToken) sawAssignEquals = true;
      needsParse = true;
    } else if (
      token.kind === ts.SyntaxKind.EqualsEqualsToken ||
      token.kind === ts.SyntaxKind.ExclamationEqualsToken
    ) {
      needsParse = true;
    }
  }
  out += text.slice(consumed);
  return { parseText: out, equationOffsets, needsParse, sawAssignEquals };
}

/**
 * After substitution, ==/!= at recorded offsets are equations. rewrite() runs
 * after checkTree, so every surviving ==/!= node is an equation.
 */
const EQUATION_OPS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
]);

/** Print `node` from the substituted source, replacing equations with Object.is. */
function rewrite(node: ts.Node, sf: ts.SourceFile): string {
  if (
    ts.isBinaryExpression(node) &&
    EQUATION_OPS.has(node.operatorToken.kind)
  ) {
    const call = `Object.is(${rewrite(node.left, sf)}, ${rewrite(node.right, sf)})`;
    return node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsToken
      ? `!${call}`
      : call;
  }
  const children: ts.Node[] = [];
  node.forEachChild((c) => {
    children.push(c);
  });
  if (children.length === 0) return sf.text.slice(node.getStart(sf), node.end);
  let out = "";
  let pos = node.getStart(sf);
  for (const c of children) {
    out += sf.text.slice(pos, c.getStart(sf));
    out += rewrite(c, sf);
    pos = c.end;
  }
  out += sf.text.slice(pos, node.end);
  return out;
}

const EQUALITY_OPS = new Set<ts.SyntaxKind>([
  ts.SyntaxKind.EqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsToken,
  ts.SyntaxKind.EqualsEqualsEqualsToken,
  ts.SyntaxKind.ExclamationEqualsEqualsToken,
]);

/** A ==/!= at a recorded glyph offset is an equation (anything else is user-written). */
function equationTester(
  sf: ts.SourceFile,
  equationOffsets: Set<number>,
): (node: ts.Node) => boolean {
  return (node) =>
    ts.isBinaryExpression(node) &&
    EQUATION_OPS.has(node.operatorToken.kind) &&
    equationOffsets.has(node.operatorToken.getStart(sf) - WRAP);
}

/**
 * One walk over the substituted parse enforcing the per-node rules, in the
 * order assignment → loose equality → chain → regrouping. Afterwards, every
 * glyph offset must have surfaced as an equation operator — a leftover means
 * the substituted ==/!= fused with an adjacent token (e.g. ≡= scanned as ===).
 */
function checkTree(
  sf: ts.SourceFile,
  equationOffsets: Set<number>,
  original: string,
): void {
  const isEquation = equationTester(sf, equationOffsets);
  const matched = new Set<number>();
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (
        op >= ts.SyntaxKind.FirstAssignment &&
        op <= ts.SyntaxKind.LastAssignment
      ) {
        throw new PabstError(
          op === ts.SyntaxKind.EqualsToken
            ? assignmentMessage(original)
            : `${ts.tokenToString(op)} is JS assignment: assignments are ` +
                `not allowed in a formula atom (in: ${original})`,
        );
      }
      if (EQUATION_OPS.has(op)) {
        const offset = node.operatorToken.getStart(sf) - WRAP;
        if (!equationOffsets.has(offset)) {
          throw op === ts.SyntaxKind.EqualsEqualsToken
            ? new PabstError(
                `loose equality (==) is not allowed: use ≡ for identity ` +
                  `(Object.is) or === for JS strict equality (in: ${original})`,
              )
            : new PabstError(
                `loose inequality (!=) is not allowed: use ≢ for negated ` +
                  `identity or !== for JS strict inequality (in: ${original})`,
              );
        }
        matched.add(offset);
      }
      if (EQUALITY_OPS.has(op)) {
        // Pure ===/!== chains are untouched JS; only equation-bearing ones
        // are ambiguous to a reader.
        for (const side of [node.left, node.right]) {
          if (
            ts.isBinaryExpression(side) &&
            EQUALITY_OPS.has(side.operatorToken.kind) &&
            (EQUATION_OPS.has(op) || EQUATION_OPS.has(side.operatorToken.kind))
          ) {
            throw new PabstError(
              `chained equations are not supported: split into conjuncts, ` +
                `e.g. a ≡ b ∧ b ≡ c, or parenthesize (in: ${original})`,
            );
          }
        }
      }
      // A bare equation regroups under ?? (≡ binds tighter); parenthesized
      // forms are intentional and left alone.
      if (op === ts.SyntaxKind.QuestionQuestionToken && isEquation(node.left)) {
        throw new PabstError(
          `parenthesize the ?? expression: ≡ binds tighter than ?? , so ` +
            `a ≡ b ?? c means (a ≡ b) ?? c (in: ${original})`,
        );
      }
    }
    if (ts.isConditionalExpression(node) && isEquation(node.condition)) {
      throw new PabstError(
        `the equation became the ternary's condition: ≡ binds tighter than ` +
          `?: — write a ≡ (b ? c : d) or (a ≡ b) ? c : d (in: ${original})`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  for (const offset of equationOffsets) {
    if (!matched.has(offset)) {
      throw new PabstError(
        `an equation glyph fused with an adjacent operator (e.g. ≡= scans ` +
          `as ===): write the equation as A ≡ B with the glyph standing ` +
          `alone (in: ${original})`,
      );
    }
  }
}

/** Formula connectives may not surface at an atom's top level (the leaf rule). */
function enforceLeafRule(
  root: ts.Expression,
  hasEquations: boolean,
  original: string,
): void {
  let expr = root;
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
  const note = (op: string) =>
    hasEquations ? ` (note: ≡ binds tighter than ${op})` : "";
  if (ts.isBinaryExpression(expr)) {
    if (expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      throw new PabstError(
        `use ∧ for conjunction at the property's top level, not JS ` +
          `&&${note("&&")} (in: ${original})`,
      );
    }
    if (expr.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
      throw new PabstError(
        `use ∨ for disjunction at the property's top level, not JS ` +
          `||${note("||")} (in: ${original})`,
      );
    }
  }
  if (
    ts.isPrefixUnaryExpression(expr) &&
    expr.operator === ts.SyntaxKind.ExclamationToken
  ) {
    throw new PabstError(
      `use ¬ for negation at the property's top level, not JS ! (in: ${original})`,
    );
  }
}

/** A root-level ?? taking an equation operand is dead code on that side. */
function banRootNullishOverEquation(
  root: ts.Expression,
  sf: ts.SourceFile,
  equationOffsets: Set<number>,
  original: string,
): void {
  const unwrap = (e: ts.Expression): ts.Expression => {
    while (ts.isParenthesizedExpression(e)) e = e.expression;
    return e;
  };
  const expr = unwrap(root);
  if (
    !ts.isBinaryExpression(expr) ||
    expr.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken
  ) {
    return;
  }
  const isEquation = equationTester(sf, equationOffsets);
  if (isEquation(unwrap(expr.left)) || isEquation(unwrap(expr.right))) {
    throw new PabstError(
      `?? at an atom's top level over an equation is dead code — Object.is ` +
        `results are never nullish: parenthesize the intended grouping ` +
        `(in: ${original})`,
    );
  }
}
