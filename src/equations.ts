import ts from "typescript";
import { PabstError } from "./errors.js";
import { regexCanFollow } from "./formula-lexer.js";

/**
 * Equation sugar for atoms: `A = B` means Object.is(A, B); `A != B` / `A ≠ B`
 * means !Object.is(A, B). The TS parser cannot parse `x + 0 = x` (the LHS is
 * not an assignment target), so `=` is substituted to `==` (and `≠` to `!=`)
 * at the token level first; consequently `=` has the precedence of JS `==`.
 * The rewrite applies at every expression depth, callback bodies included, so
 * assignment expressions cannot appear in a formula atom.
 */
export function desugarEquations(text: string): string {
  const { parseText, sawEquality } = substitute(text);
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
