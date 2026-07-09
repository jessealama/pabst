import ts from "typescript";
import { PabstError } from "./errors.js";
import { regexCanFollow } from "./formula-lexer.js";

/** Node offsets in the parsed file are parseText offsets + 1 (leading paren). */
const WRAP = 1;

/**
 * Equation sugar for atoms: `A = B` means Object.is(A, B); `A != B` / `A ≠ B`
 * means !Object.is(A, B). The TS parser cannot parse `x + 0 = x` (the LHS is
 * not an assignment target), so `=` is substituted to `==` (and `≠` to `!=`)
 * at the token level first; consequently `=` has the precedence of JS `==`.
 * The rewrite applies at every expression depth, callback bodies included, so
 * assignment expressions cannot appear in a formula atom.
 */
export function desugarEquations(text: string): string {
  const { parseText, equationOffsets, sawEquality } = substitute(text);
  if (!sawEquality) return text;
  const sf = ts.createSourceFile(
    "__atom.ts",
    `(${parseText});`,
    ts.ScriptTarget.Latest,
    true,
  );
  const stmt = sf.statements[0];
  if (
    !stmt ||
    !ts.isExpressionStatement(stmt) ||
    !ts.isParenthesizedExpression(stmt.expression)
  ) {
    throw new PabstError(`cannot parse atom: ${text}`);
  }
  const diags = (sf as unknown as { parseDiagnostics: readonly unknown[] })
    .parseDiagnostics;
  if (diags.length > 0) {
    throw new PabstError(
      `cannot parse atom (JS assignment and default-parameter initializers ` +
        `are not part of the formula language): ${text}`,
    );
  }
  banLooseEquality(sf, equationOffsets, text);
  rejectChains(sf, text);
  enforceRootConnectives(stmt.expression.expression, text);
  return rewrite(stmt.expression.expression, sf);
}

interface Substitution {
  /** The atom with `=` → `==` and `≠` → `!=` at the token level. */
  parseText: string;
  /** Offsets in parseText of `==` tokens that the user wrote as `=`. */
  equationOffsets: Set<number>;
  /** Whether any equation/equality token was seen (else nothing to rewrite). */
  sawEquality: boolean;
}

function substitute(text: string): Substitution {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, /*skipTrivia*/ true);
  scanner.setText(text);
  let out = "";
  let consumed = 0;
  const equationOffsets = new Set<number>();
  let sawEquality = false;
  let prev: ts.SyntaxKind | null = null;
  let kind: ts.SyntaxKind;
  // Open-brace count within each active template substitution, innermost last.
  // The standalone scanner does not re-enter template mode after a `${…}`
  // substitution closes, so its middle/tail text would be scanned as ordinary
  // tokens (corrupting a `=`/`≠` in that text). Track the nesting and re-scan
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
      // EqualsToken is not mistaken for an equation.
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
    if (kind === ts.SyntaxKind.EqualsToken) {
      out += text.slice(consumed, scanner.getTokenStart());
      equationOffsets.add(out.length);
      out += "==";
      consumed = scanner.getTextPos();
      sawEquality = true;
    } else if (scanner.getTokenText() === "≠") {
      out += text.slice(consumed, scanner.getTokenStart()) + "!=";
      consumed = scanner.getTextPos();
      sawEquality = true;
    } else if (
      kind === ts.SyntaxKind.EqualsEqualsToken ||
      kind === ts.SyntaxKind.ExclamationEqualsToken
    ) {
      sawEquality = true;
    }
    prev = kind;
  }
  out += text.slice(consumed);
  return { parseText: out, equationOffsets, sawEquality };
}

/** After substitution, these operators are equations (== survives the ban). */
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

/** A `==` whose offset was NOT produced by the `=` substitution is user-written. */
function banLooseEquality(
  sf: ts.SourceFile,
  equationOffsets: Set<number>,
  original: string,
): void {
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsToken &&
      !equationOffsets.has(node.operatorToken.getStart(sf) - WRAP)
    ) {
      throw new PabstError(
        `loose equality (==) is not allowed: use = for identity (Object.is) ` +
          `or === for JS strict equality (in: ${original})`,
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/**
 * An equation may not be a direct operand of another equality-precedence
 * operator: `a = b = c`, `a = b != c`, `a = b === c` are ambiguous to a
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
              `e.g. a = b ∧ b = c, or parenthesize (in: ${original})`,
          );
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

/**
 * `=` binds tighter than && and ||, so `a = b && c` groups as (a = b) && c —
 * a JS connective at the atom's top level. The pre-desugar leaf rule in
 * formula-parser.ts cannot see this (it reads `a = (b && c)` as assignment),
 * so re-check on the substituted parse.
 */
function enforceRootConnectives(root: ts.Expression, original: string): void {
  let expr = root;
  while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
  if (!ts.isBinaryExpression(expr)) return;
  if (expr.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    throw new PabstError(
      `use ∧ for conjunction at the property's top level, not JS && ` +
        `(note: = binds tighter than &&) (in: ${original})`,
    );
  }
  if (expr.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
    throw new PabstError(
      `use ∨ for disjunction at the property's top level, not JS || ` +
        `(note: = binds tighter than ||) (in: ${original})`,
    );
  }
}
