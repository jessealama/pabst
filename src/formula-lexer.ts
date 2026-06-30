import ts from "typescript";

export type FTokenKind =
  | "not" | "and" | "or" | "implies" | "iff"
  | "open" | "close" | "js";

export interface FToken { kind: FTokenKind; text: string; start: number; end: number; }

const GLYPH: Record<string, FTokenKind> = {
  "¬": "not", "∧": "and", "∨": "or", "→": "implies", "↔": "iff",
};

const OPEN = new Set([
  ts.SyntaxKind.OpenParenToken, ts.SyntaxKind.OpenBracketToken, ts.SyntaxKind.OpenBraceToken,
]);
const CLOSE = new Set([
  ts.SyntaxKind.CloseParenToken, ts.SyntaxKind.CloseBracketToken, ts.SyntaxKind.CloseBraceToken,
]);

/** Tokenize a formula body. Glyphs/fallbacks become connective tokens; the rest is js. */
export function lexFormula(body: string): FToken[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, /*skipTrivia*/ true);
  scanner.setText(body);
  const raw: FToken[] = [];
  let kind: ts.SyntaxKind;
  while ((kind = scanner.scan()) !== ts.SyntaxKind.EndOfFileToken) {
    const text = scanner.getTokenText();
    const start = scanner.getTokenStart();
    const end = scanner.getTextPos();
    rejectQuantifiers(text);
    const glyph = GLYPH[text];
    if (glyph) { raw.push({ kind: glyph, text, start, end }); continue; }
    if (text === "iff") { raw.push({ kind: "iff", text, start, end }); continue; }
    if (OPEN.has(kind)) { raw.push({ kind: "open", text, start, end }); continue; }
    if (CLOSE.has(kind)) { raw.push({ kind: "close", text, start, end }); continue; }
    raw.push({ kind: "js", text, start, end });
  }
  return mergeArrowFallbacks(raw);
}

function rejectQuantifiers(text: string): void {
  if (text === "∃" || text === "exists") {
    throw new Error(
      "existential quantifiers (∃ / exists) are not supported: property-based " +
      "testing samples inputs, so it can refute ∀ with a counterexample but cannot " +
      "soundly confirm ∃ (a bounded/exhaustive mode would be needed)",
    );
  }
  if (text === "∀" || text === "forall") {
    throw new Error("nested quantifiers are not supported: bind all variables in the leading ∀ prefix");
  }
}

/** Merge adjacent js tokens forming -> / ==> (implies) and <-> (iff). */
function mergeArrowFallbacks(toks: FToken[]): FToken[] {
  const out: FToken[] = [];
  for (let i = 0; i < toks.length; i++) {
    const a = toks[i]!, b = toks[i + 1], c = toks[i + 2];
    const adj = (x: FToken, y?: FToken) => !!y && x.end === y.start;
    // <-> : "<" "-" ">"
    if (a.text === "<" && b?.text === "-" && c?.text === ">" && adj(a, b) && adj(b, c)) {
      out.push({ kind: "iff", text: "<->", start: a.start, end: c.end }); i += 2; continue;
    }
    // -> : "-" ">"    and    ==> : "==" ">"
    if ((a.text === "-" || a.text === "==") && b?.text === ">" && adj(a, b)) {
      out.push({ kind: "implies", text: a.text + ">", start: a.start, end: b.end }); i += 1; continue;
    }
    out.push(a);
  }
  return out;
}
