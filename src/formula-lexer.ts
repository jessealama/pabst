import ts from "typescript";
import { PabstError } from "./errors.js";

export type FTokenKind =
  "not" | "and" | "or" | "implies" | "iff" | "open" | "close" | "js";

export interface FToken {
  kind: FTokenKind;
  text: string;
  start: number;
  end: number;
}

const GLYPH: Record<string, FTokenKind> = {
  "¬": "not",
  "∧": "and",
  "∨": "or",
  "→": "implies",
  "↔": "iff",
};

const OPEN = new Set([
  ts.SyntaxKind.OpenParenToken,
  ts.SyntaxKind.OpenBracketToken,
  ts.SyntaxKind.OpenBraceToken,
  // `…${ opens a substitution: its contents are never at depth 0.
  ts.SyntaxKind.TemplateHead,
]);
const CLOSE = new Set([
  ts.SyntaxKind.CloseParenToken,
  ts.SyntaxKind.CloseBracketToken,
  ts.SyntaxKind.CloseBraceToken,
  // }…` ends the last substitution. TemplateMiddle (}…${) closes one and
  // opens the next — net depth unchanged — so it stays a js token.
  ts.SyntaxKind.TemplateTail,
]);

export interface ScannedToken {
  kind: ts.SyntaxKind;
  text: string;
  start: number;
  end: number;
}

/**
 * Scan `text` with the context fixes the standalone TS scanner does not
 * apply on its own: `/` regex-vs-division, `>` re-merged into >=, >>, … (the
 * base scan splits them for generic-closing-`>` handling), and template
 * continuation after a `${…}` substitution closes (the scanner would
 * otherwise leave template mode and corrupt the middle/tail text).
 */
export function* scanTokens(text: string, start = 0): Generator<ScannedToken> {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, /*skipTrivia*/ true);
  scanner.setText(text, start);
  let kind: ts.SyntaxKind;
  let prev: ts.SyntaxKind | null = null;
  let prevText = "";
  // Open-brace count within each active template substitution, innermost last.
  const templateBraces: number[] = [];
  while ((kind = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    if (
      kind === ts.SyntaxKind.SlashToken ||
      kind === ts.SyntaxKind.SlashEqualsToken
    ) {
      // A `/` right after a `\` is the `\/` (or) fallback, not a regex.
      if (regexCanFollow(prev) && prevText !== "\\") {
        const re = scanner.reScanSlashToken();
        if (re === ts.SyntaxKind.RegularExpressionLiteral) kind = re;
      }
    }
    if (kind === ts.SyntaxKind.GreaterThanToken) {
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
    yield {
      kind,
      text: tokenText,
      start: scanner.getTokenStart(),
      end: scanner.getTextPos(),
    };
    prev = kind;
    prevText = tokenText;
  }
}

/** Tokenize a formula body. Glyphs/fallbacks become connective tokens; the rest is js. */
export function lexFormula(body: string): FToken[] {
  const raw: FToken[] = [];
  for (const { kind, text, start, end } of scanTokens(body)) {
    rejectQuantifiers(text);
    const fkind: FTokenKind =
      GLYPH[text] ??
      (text === "iff"
        ? "iff"
        : OPEN.has(kind)
          ? "open"
          : CLOSE.has(kind)
            ? "close"
            : "js");
    raw.push({ kind: fkind, text, start, end });
  }
  return mergeArrowFallbacks(mergeSlashFallbacks(raw));
}

/** The source text spanned by toks (empty when toks is empty). */
export function sliceText(
  source: string,
  toks: readonly { start: number; end: number }[],
): string {
  if (toks.length === 0) return "";
  return source.slice(toks[0]!.start, toks[toks.length - 1]!.end);
}

/** A `/` can begin a regex unless the previous token ends a value (then it's division). */
export function regexCanFollow(prev: ts.SyntaxKind | null): boolean {
  if (prev === null) return true;
  switch (prev) {
    case ts.SyntaxKind.Identifier:
    case ts.SyntaxKind.CloseParenToken:
    case ts.SyntaxKind.CloseBracketToken:
    case ts.SyntaxKind.CloseBraceToken:
    case ts.SyntaxKind.RegularExpressionLiteral:
    case ts.SyntaxKind.TemplateTail:
    case ts.SyntaxKind.ThisKeyword:
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.PlusPlusToken:
    case ts.SyntaxKind.MinusMinusToken:
      return false;
  }
  return !(
    prev >= ts.SyntaxKind.FirstLiteralToken &&
    prev <= ts.SyntaxKind.LastLiteralToken
  );
}

function rejectQuantifiers(text: string): void {
  if (text === "∃" || text === "exists") {
    throw new PabstError(
      "existential quantifiers (∃ / exists) are not supported: property-based " +
        "testing samples inputs, so it can refute ∀ with a counterexample but cannot " +
        "soundly confirm ∃ (a bounded/exhaustive mode would be needed)",
    );
  }
  if (text === "∀" || text === "forall") {
    throw new PabstError(
      "nested quantifiers are not supported: bind all variables in the leading ∀ prefix",
    );
  }
}

/** Merge adjacent js tokens forming -> / ==> (implies) and <-> (iff). */
function mergeArrowFallbacks(toks: FToken[]): FToken[] {
  const out: FToken[] = [];
  for (let i = 0; i < toks.length; i++) {
    const a = toks[i]!,
      b = toks[i + 1],
      c = toks[i + 2];
    const adj = (x: FToken, y?: FToken) => !!y && x.end === y.start;
    // <-> : "<" "-" ">"
    if (
      a.text === "<" &&
      b?.text === "-" &&
      c?.text === ">" &&
      adj(a, b) &&
      adj(b, c)
    ) {
      out.push({ kind: "iff", text: "<->", start: a.start, end: c.end });
      i += 2;
      continue;
    }
    // -> : "-" ">"    and    ==> : "==" ">"
    if ((a.text === "-" || a.text === "==") && b?.text === ">" && adj(a, b)) {
      out.push({
        kind: "implies",
        text: a.text + ">",
        start: a.start,
        end: b.end,
      });
      i += 1;
      continue;
    }
    out.push(a);
  }
  return out;
}

/** Merge a real slash adjacent to a backslash: /\ → and, \/ → or. */
function mergeSlashFallbacks(toks: FToken[]): FToken[] {
  const out: FToken[] = [];
  for (let i = 0; i < toks.length; i++) {
    const a = toks[i]!,
      b = toks[i + 1];
    const adj = !!b && a.end === b.start;
    if (adj && a.text === "/" && b!.text === "\\") {
      out.push({ kind: "and", text: "/\\", start: a.start, end: b!.end });
      i += 1;
      continue;
    }
    if (adj && a.text === "\\" && b!.text === "/") {
      out.push({ kind: "or", text: "\\/", start: a.start, end: b!.end });
      i += 1;
      continue;
    }
    out.push(a);
  }
  return out;
}
