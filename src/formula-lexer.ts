import ts from "typescript";
import { PabstError } from "./errors.js";

export type FTokenKind =
  | "not"
  | "and"
  | "or"
  | "implies"
  | "iff"
  | "open"
  | "close"
  | "js";

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
]);
const CLOSE = new Set([
  ts.SyntaxKind.CloseParenToken,
  ts.SyntaxKind.CloseBracketToken,
  ts.SyntaxKind.CloseBraceToken,
]);

/** Tokenize a formula body. Glyphs/fallbacks become connective tokens; the rest is js. */
export function lexFormula(body: string): FToken[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, /*skipTrivia*/ true);
  scanner.setText(body);
  const raw: FToken[] = [];
  let kind: ts.SyntaxKind;
  let prev: ts.SyntaxKind | null = null;
  while ((kind = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    if (
      kind === ts.SyntaxKind.SlashToken ||
      kind === ts.SyntaxKind.SlashEqualsToken
    ) {
      // A `/` right after a `\` is the `\/` (or) fallback, not a regex.
      const afterBackslash = raw[raw.length - 1]?.text === "\\";
      if (regexCanFollow(prev) && !afterBackslash) {
        const re = scanner.reScanSlashToken();
        if (re === ts.SyntaxKind.RegularExpressionLiteral) kind = re;
      }
    }
    const text = scanner.getTokenText();
    const start = scanner.getTokenStart();
    const end = scanner.getTextPos();
    rejectQuantifiers(text);
    const glyph = GLYPH[text];
    if (glyph) {
      raw.push({ kind: glyph, text, start, end });
      prev = kind;
      continue;
    }
    if (text === "iff") {
      raw.push({ kind: "iff", text, start, end });
      prev = kind;
      continue;
    }
    if (OPEN.has(kind)) {
      raw.push({ kind: "open", text, start, end });
      prev = kind;
      continue;
    }
    if (CLOSE.has(kind)) {
      raw.push({ kind: "close", text, start, end });
      prev = kind;
      continue;
    }
    raw.push({ kind: "js", text, start, end });
    prev = kind;
  }
  return mergeArrowFallbacks(mergeSlashFallbacks(raw));
}

/** A `/` can begin a regex unless the previous token ends a value (then it's division). */
function regexCanFollow(prev: ts.SyntaxKind | null): boolean {
  if (prev === null) return true;
  if (prev === ts.SyntaxKind.Identifier) return false;
  if (
    prev >= ts.SyntaxKind.FirstLiteralToken &&
    prev <= ts.SyntaxKind.LastLiteralToken
  )
    return false;
  if (
    prev === ts.SyntaxKind.CloseParenToken ||
    prev === ts.SyntaxKind.CloseBracketToken
  )
    return false;
  if (prev === ts.SyntaxKind.RegularExpressionLiteral) return false;
  return true;
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

/**
 * Merge a real slash adjacent to a backslash: /\ → and, \/ → or.
 *
 * Known limitation: template literals with `${…}` interpolation that contain
 * connective glyphs may mis-tokenize; property bodies rarely use interpolation.
 * Hardening via reScanTemplateToken is out of scope.
 */
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
