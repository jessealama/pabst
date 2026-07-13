import ts from "typescript";
import { PabstError } from "./errors.js";
import { lexFormula, type FToken } from "./formula-lexer.js";

/**
 * Validate an atom's JS and desugar its equation (see README, "Equations"):
 * a depth-0 `A ≡ B` becomes `Object.is(A, B)` and `A ≢ B` becomes
 * `!Object.is(A, B)`. The glyphs are available only at the atom's top
 * level — in nested positions (callbacks, arguments, template
 * substitutions) call Object.is directly.
 */
export function desugarEquations(text: string): string {
  const toks = lexFormula(text);

  // --- Token-level rules (single tokens are visible at every depth) ---
  let sawPlainAssign = false;
  let sawAssignMaterial = false;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.text === "≠") {
      throw new PabstError(
        `≠ is not pabst syntax: write ≢ for negated identity (in: ${text})`,
      );
    }
    if (isGlyph(t)) {
      const prev = toks[i - 1];
      const next = toks[i + 1];
      const fused =
        (prev && prev.end === t.start && /=$/.test(prev.text)) ||
        (next && next.start === t.end && /^=/.test(next.text));
      if (fused) {
        throw new PabstError(
          `an equation glyph fused with an adjacent operator (e.g. ≡= scans ` +
            `as ===): write the equation as A ≡ B with the glyph standing ` +
            `alone (in: ${text})`,
        );
      }
    }
    if (t.text === "=") {
      sawPlainAssign = true;
      sawAssignMaterial = true;
    } else if (ASSIGN_TOKENS.has(t.text)) {
      sawAssignMaterial = true;
    }
  }

  // --- Locate depth-0 glyphs and classify the atom's shape ---
  const depth0 = depthZeroIndex(toks);
  const glyphs = [...depth0.keys()].filter((i) => isGlyph(toks[i]!));
  const hasTernary = [...depth0.keys()].some(
    (i) => toks[i]!.text === "?" || toks[i]!.text === ":",
  );
  if (glyphs.length > 0 && hasTernary) {
    throw new PabstError(
      `an equation cannot sit beside an unparenthesized ternary: write ` +
        `a ≡ (b ? c : d), or call Object.is in the ternary's branches ` +
        `(in: ${text})`,
    );
  }
  if (glyphs.length > 1) {
    throw new PabstError(
      `chained equations are not supported: split into conjuncts, ` +
        `e.g. a ≡ b ∧ b ≡ c, or parenthesize (in: ${text})`,
    );
  }

  // --- Depth-0 JS logical connectives may not surface in an atom ---
  for (const i of depth0.keys()) {
    if (toks[i]!.text === "&&") {
      throw new PabstError(
        `use ∧ for conjunction at the property's top level, not JS && (in: ${text})`,
      );
    }
    if (toks[i]!.text === "||") {
      throw new PabstError(
        `use ∨ for disjunction at the property's top level, not JS || (in: ${text})`,
      );
    }
  }

  // --- Loose equality (any depth) ---
  for (const t of toks) {
    if (t.text === "==") {
      throw new PabstError(
        `loose equality (==) is not allowed: use ≡ for identity ` +
          `(Object.is) or === for JS strict equality (in: ${text})`,
      );
    }
    if (t.text === "!=") {
      throw new PabstError(
        `loose inequality (!=) is not allowed: use ≢ for negated ` +
          `identity or !== for JS strict inequality (in: ${text})`,
      );
    }
  }

  // --- Split the equation and guard its sides ---
  let js = text;
  if (glyphs.length === 1) {
    const g = glyphs[0]!;
    const left = toks.slice(0, g);
    const right = toks.slice(g + 1);
    if (left.length === 0 || right.length === 0) {
      throw new PabstError(`cannot parse atom: ${text}`);
    }
    guardSide(left, "left", text);
    guardSide(right, "right", text);
    const l = sliceText(text, left);
    const r = sliceText(text, right);
    const call = `Object.is(${l}, ${r})`;
    js = toks[g]!.text === "≡" ? call : `!${call}`;
  }

  // --- TS-AST validation (Phase 3 ports this parse to @babel/parser) ---
  const sf = ts.createSourceFile(
    "__atom.ts",
    `(${js});`,
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
    if (sawPlainAssign) throw new PabstError(assignmentMessage(text));
    const nested = nestedGlyph(toks, depth0);
    if (nested) {
      throw new PabstError(
        `${nested.text} is only available at an atom's top level — in a ` +
          `nested position, call Object.is(A, B) (or !Object.is(A, B)) ` +
          `directly (in: ${text})`,
      );
    }
    if (glyphs.length > 0 || sawAssignMaterial) {
      throw new PabstError(`cannot parse atom: ${text}`);
    }
    // Not TS-parseable and no formula material: leave the atom for the
    // generated test code to diagnose.
    return js;
  }
  banAssignments(root, text);
  // A desugared ≢ is our own `!Object.is(…)` — the root-! rule judges only
  // atoms the user wrote, so it applies when no equation was split.
  if (glyphs.length === 0) banRootNegation(root, text);
  return js;
}

function assignmentMessage(original: string): string {
  return (
    `= is JS assignment, and assignments are not allowed in a formula atom: ` +
    `if you meant equality, write A ≡ B for identity (Object.is), or call ` +
    `Object.is(A, B) directly (in: ${original})`
  );
}

const ASSIGN_TOKENS = new Set([
  "=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "**=",
  "<<=",
  ">>=",
  ">>>=",
  "&=",
  "|=",
  "^=",
  "&&=",
  "||=",
  "??=",
]);

function isGlyph(t: FToken): boolean {
  return t.text === "≡" || t.text === "≢";
}

/** The set of token indices at depth 0 (template substitutions nest). */
function depthZeroIndex(toks: FToken[]): Set<number> {
  const at = new Set<number>();
  let depth = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.kind === "open") depth++;
    else if (t.kind === "close") depth = Math.max(0, depth - 1);
    else if (depth === 0) at.add(i);
  }
  return at;
}

/** The first equation glyph NOT at depth 0, if any. */
function nestedGlyph(toks: FToken[], depth0: Set<number>): FToken | undefined {
  for (let i = 0; i < toks.length; i++) {
    if (isGlyph(toks[i]!) && !depth0.has(i)) return toks[i];
  }
  return undefined;
}

/** An equation side may not carry a depth-0 ===/!== (ambiguous chain) or
 * ??/ternary (parenthesize the intended grouping). */
function guardSide(side: FToken[], which: "left" | "right", text: string) {
  let depth = 0;
  for (const t of side) {
    if (t.kind === "open") depth++;
    else if (t.kind === "close") depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      if (t.text === "===" || t.text === "!==") {
        throw new PabstError(
          `chained equations are not supported: split into conjuncts, ` +
            `e.g. a ≡ b ∧ b ≡ c, or parenthesize (in: ${text})`,
        );
      }
      if (t.text === "??") {
        throw which === "right"
          ? new PabstError(
              `parenthesize the ?? expression: ≡ binds tighter than ?? , so ` +
                `a ≡ b ?? c means (a ≡ b) ?? c (in: ${text})`,
            )
          : new PabstError(
              `?? at an atom's top level over an equation is dead code — ` +
                `Object.is results are never nullish: parenthesize the ` +
                `intended grouping (in: ${text})`,
            );
      }
    }
  }
}

function sliceText(text: string, toks: FToken[]): string {
  return text.slice(toks[0]!.start, toks[toks.length - 1]!.end).trim();
}

/** Assignments cannot appear in an atom at any depth. A parameter default
 * ((x = 1) => …) is an initializer, not a BinaryExpression, so it passes. */
function banAssignments(root: ts.Node, text: string): void {
  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node)) {
      const op = node.operatorToken.kind;
      if (
        op >= ts.SyntaxKind.FirstAssignment &&
        op <= ts.SyntaxKind.LastAssignment
      ) {
        throw new PabstError(
          op === ts.SyntaxKind.EqualsToken
            ? assignmentMessage(text)
            : `${ts.tokenToString(op)} is JS assignment: assignments are ` +
                `not allowed in a formula atom (in: ${text})`,
        );
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(root);
}

/** Formula-level negation is ¬, not a root-level JS ! (the leaf rule). */
function banRootNegation(root: ts.Expression, text: string): void {
  let expr = root;
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
  if (
    ts.isPrefixUnaryExpression(expr) &&
    expr.operator === ts.SyntaxKind.ExclamationToken
  ) {
    throw new PabstError(
      `use ¬ for negation at the property's top level, not JS ! (in: ${text})`,
    );
  }
}
