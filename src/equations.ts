import ts from "typescript";
import { PabstError } from "./errors.js";
import { regexCanFollow } from "./formula-lexer.js";

/** Node offsets in the parsed file are parseText offsets + 1 (leading paren). */
const WRAP = 1;

/**
 * Equation sugar for atoms: `A ≡ B` means Object.is(A, B); `A ≢ B` means
 * !Object.is(A, B). The glyphs are not JS, so the TS parser cannot see them:
 * they are substituted to `==` / `!=` at the token level first; consequently
 * equations have the precedence of JS `==`. The rewrite applies at every
 * expression depth, callback bodies included. Plain `=` is JS assignment and
 * is rejected (default-parameter initializers are fine); user-written
 * `==` / `!=` and the two-bar `≠` are rejected with hints.
 */
export function desugarEquations(text: string): string {
  const { parseText, equationOffsets, needsParse, sawAssignEquals } =
    substitute(text);
  if (!needsParse) return text;
  const sf = ts.createSourceFile(
    "__atom.ts",
    `(${parseText});`,
    ts.ScriptTarget.Latest,
    true,
  );
  const stmt = sf.statements[0];
  const diags = (sf as unknown as { parseDiagnostics: readonly unknown[] })
    .parseDiagnostics;
  if (
    !stmt ||
    !ts.isExpressionStatement(stmt) ||
    !ts.isParenthesizedExpression(stmt.expression) ||
    diags.length > 0
  ) {
    throw new PabstError(
      sawAssignEquals ? assignmentMessage(text) : `cannot parse atom: ${text}`,
    );
  }
  banAssignments(sf, text);
  banLooseEquality(sf, equationOffsets, text);
  rejectChains(sf, text);
  rejectRegroupedEquations(sf, equationOffsets, text);
  enforceRootConnectives(stmt.expression.expression, text);
  return rewrite(stmt.expression.expression, sf);
}

function assignmentMessage(original: string): string {
  return (
    `= is JS assignment, not equality: write A ≡ B for identity ` +
    `(Object.is), or call Object.is(A, B) directly (in: ${original})`
  );
}

interface Substitution {
  /** The atom with `≡` → `==` and `≢` → `!=` at the token level. */
  parseText: string;
  /** Offsets in parseText of `==` / `!=` tokens the user wrote as glyphs. */
  equationOffsets: Set<number>;
  /** Whether the parse-and-check pass is needed at all. */
  needsParse: boolean;
  /** Whether a plain `=` (JS assignment) token was seen. */
  sawAssignEquals: boolean;
}

function substitute(text: string): Substitution {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, /*skipTrivia*/ true);
  scanner.setText(text);
  let out = "";
  let consumed = 0;
  const equationOffsets = new Set<number>();
  let needsParse = false;
  let sawAssignEquals = false;
  let prev: ts.SyntaxKind | null = null;
  let kind: ts.SyntaxKind;
  // Open-brace count within each active template substitution, innermost last.
  // The standalone scanner does not re-enter template mode after a `${…}`
  // substitution closes, so its middle/tail text would be scanned as ordinary
  // tokens (corrupting a glyph in that text). Track the nesting and re-scan
  // the closing brace as a TemplateMiddle/TemplateTail to stay in template mode.
  const templateBraces: number[] = [];
  while ((kind = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    if (
      kind === ts.SyntaxKind.SlashToken ||
      kind === ts.SyntaxKind.SlashEqualsToken
    ) {
      if (regexCanFollow(prev)) {
        const re = scanner.reScanSlashToken();
        if (re === ts.SyntaxKind.RegularExpressionLiteral) kind = re;
      }
    }
    if (kind === ts.SyntaxKind.GreaterThanToken) {
      // The base scan splits >= (and >>, >>=, …) into > followed by more
      // tokens for generic-closing-`>` handling; merge them so the lone
      // EqualsToken is not mistaken for an assignment.
      kind = scanner.reScanGreaterToken();
    }
    const top = templateBraces.length - 1;
    if (kind === ts.SyntaxKind.TemplateHead) {
      // `` `…${ `` opens a template; its first substitution is now active.
      templateBraces.push(0);
    } else if (kind === ts.SyntaxKind.OpenBraceToken && top >= 0) {
      templateBraces[top] = templateBraces[top]! + 1;
    } else if (kind === ts.SyntaxKind.CloseBraceToken && top >= 0) {
      if (templateBraces[top]! > 0) {
        // an ordinary `}` inside the substitution
        templateBraces[top] = templateBraces[top]! - 1;
      } else {
        // This `}` ends the substitution: re-scan as template continuation so
        // the following text stays template text rather than loose tokens.
        kind = scanner.reScanTemplateToken(/*isTaggedTemplate*/ false);
        if (kind === ts.SyntaxKind.TemplateTail) templateBraces.pop();
        // TemplateMiddle keeps the same level (a new substitution follows).
      }
    }
    const tokenText = scanner.getTokenText();
    if (tokenText === "≡" || tokenText === "≢") {
      out += text.slice(consumed, scanner.getTokenStart());
      equationOffsets.add(out.length);
      out += tokenText === "≡" ? "==" : "!=";
      consumed = scanner.getTextPos();
      needsParse = true;
    } else if (tokenText === "≠") {
      throw new PabstError(
        `≠ is not pabst syntax: write ≢ for negated identity (in: ${text})`,
      );
    } else if (kind === ts.SyntaxKind.EqualsToken) {
      sawAssignEquals = true;
      needsParse = true;
    } else if (
      kind === ts.SyntaxKind.EqualsEqualsToken ||
      kind === ts.SyntaxKind.ExclamationEqualsToken
    ) {
      needsParse = true;
    }
    prev = kind;
  }
  out += text.slice(consumed);
  return { parseText: out, equationOffsets, needsParse, sawAssignEquals };
}

/**
 * After substitution, ==/!= at recorded offsets are equations. rewrite() runs
 * after banLooseEquality, so every surviving ==/!= node is an equation.
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

/** Plain `=` assignment expressions cannot appear in a formula atom. */
function banAssignments(sf: ts.SourceFile, original: string): void {
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken
    ) {
      throw new PabstError(assignmentMessage(original));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/** A ==/!= whose offset was NOT produced by a glyph substitution is user-written. */
function banLooseEquality(
  sf: ts.SourceFile,
  equationOffsets: Set<number>,
  original: string,
): void {
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      EQUATION_OPS.has(node.operatorToken.kind) &&
      !equationOffsets.has(node.operatorToken.getStart(sf) - WRAP)
    ) {
      throw node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken
        ? new PabstError(
            `loose equality (==) is not allowed: use ≡ for identity ` +
              `(Object.is) or === for JS strict equality (in: ${original})`,
          )
        : new PabstError(
            `loose inequality (!=) is not allowed: use ≢ for negated ` +
              `identity or !== for JS strict inequality (in: ${original})`,
          );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/**
 * An equation may not be a direct operand of another equality-precedence
 * operator: `a ≡ b ≡ c`, `a ≡ b ≢ c`, `a ≡ b === c` are ambiguous to a
 * reader even though JS associativity would pick a grouping. Parenthesized
 * forms are fine; pure ===/!== chains are untouched JS.
 */
function rejectChains(sf: ts.SourceFile, original: string): void {
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      EQUALITY_OPS.has(node.operatorToken.kind)
    ) {
      for (const side of [node.left, node.right]) {
        if (
          ts.isBinaryExpression(side) &&
          EQUALITY_OPS.has(side.operatorToken.kind) &&
          (EQUATION_OPS.has(node.operatorToken.kind) ||
            EQUATION_OPS.has(side.operatorToken.kind))
        ) {
          throw new PabstError(
            `chained equations are not supported: split into conjuncts, ` +
              `e.g. a ≡ b ∧ b ≡ c, or parenthesize (in: ${original})`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/**
 * `≡` / `≢` bind tighter than `??` and `?:`, but read math-loose, so a bare
 * equation silently regroups: `a ≡ b ?? c` is `(a ≡ b) ?? c` (the `?? c` is
 * dead code — an Object.is is never nullish) and `a ≡ b ? c : d` is
 * `(a ≡ b) ? c : d` (the equation becomes the ternary's condition). Reject at
 * every depth when the trapped side is a bare equation; a parenthesized form
 * is intentional and left alone.
 */
function rejectRegroupedEquations(
  sf: ts.SourceFile,
  equationOffsets: Set<number>,
  original: string,
): void {
  const isEquation = (node: ts.Node): boolean =>
    ts.isBinaryExpression(node) &&
    EQUATION_OPS.has(node.operatorToken.kind) &&
    equationOffsets.has(node.operatorToken.getStart(sf) - WRAP);
  const visit = (node: ts.Node): void => {
    if (ts.isConditionalExpression(node) && isEquation(node.condition)) {
      throw new PabstError(
        `the equation became the ternary's condition: ≡ binds tighter than ` +
          `?: — write a ≡ (b ? c : d) or (a ≡ b) ? c : d (in: ${original})`,
      );
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken &&
      isEquation(node.left)
    ) {
      throw new PabstError(
        `parenthesize the ?? expression: ≡ binds tighter than ?? , so ` +
          `a ≡ b ?? c means (a ≡ b) ?? c (in: ${original})`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/**
 * `≡` binds tighter than && and ||, so `a ≡ b && c` groups as
 * (a ≡ b) && c — a JS connective at the atom's top level. The pre-desugar
 * leaf rule in formula-parser.ts cannot see this (the glyph is not JS), so
 * re-check on the substituted parse.
 */
function enforceRootConnectives(root: ts.Expression, original: string): void {
  let expr = root;
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
  if (!ts.isBinaryExpression(expr)) return;
  if (expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    throw new PabstError(
      `use ∧ for conjunction at the property's top level, not JS && ` +
        `(note: ≡ binds tighter than &&) (in: ${original})`,
    );
  }
  if (expr.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
    throw new PabstError(
      `use ∨ for disjunction at the property's top level, not JS || ` +
        `(note: ≡ binds tighter than ||) (in: ${original})`,
    );
  }
  if (expr.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
    throw new PabstError(
      `?? at an atom's top level over an equation is dead code — Object.is ` +
        `results are never nullish: parenthesize the intended grouping ` +
        `(in: ${original})`,
    );
  }
}
