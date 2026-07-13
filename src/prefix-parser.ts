import ts from "typescript";
import { isDomain } from "./domains.js";
import { PabstError } from "./errors.js";
import type { Binder, Range, StringPattern } from "./ir.js";
import { parseRange } from "./range.js";
import {
  parseRegexGuard,
  scanRegexLiteral,
  TRUNCATION_HINT,
} from "./regex-guard.js";
import { scanTokens, sliceText, type ScannedToken } from "./formula-lexer.js";

export interface ParsedPrefix {
  binders: Binder[];
  body: string;
}

const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** prefix ::= FORALL binder-group+   (docs/grammar.ebnf) */
export function parsePrefix(formula: string): ParsedPrefix {
  const { toks, unterminatedSlash } = prefixTokens(formula);
  const head = toks[0];
  if (head && (head.text === "∃" || head.text === "exists")) {
    throw new PabstError(
      "existential quantifiers (∃ / exists) are not supported: property-based " +
        "testing samples inputs, so it can refute ∀ with a counterexample but cannot " +
        "soundly confirm ∃ (a bounded/exhaustive mode would be needed)",
    );
  }
  if (!head || (head.text !== "forall" && head.text !== "∀")) {
    throw new PabstError(
      `expected 'forall' (or ∀) at start of property: ${formula.trim().slice(0, 60)}`,
    );
  }
  let i = 1;
  const binders: Binder[] = [];
  while (i < toks.length && toks[i]!.text === "(") {
    const close = groupExtent(toks, i, formula, unterminatedSlash);
    binders.push(...parseBinderGroup(toks, i, close, formula));
    i = close + 1;
  }
  if (binders.length === 0) {
    throw new PabstError(
      `expected at least one binder group '(x: domain)' after forall`,
    );
  }
  const open = toks[i];
  if (open && open.text === ",") {
    throw new PabstError(
      `since pabst 0.13.0 the property body goes in braces instead of after ` +
        `a comma: forall (x: int) { ... }`,
    );
  }
  if (!open || open.text !== "{") {
    const at = open?.start ?? formula.length;
    throw new PabstError(
      `expected '{' to open the property body, got: ${formula.slice(at, at + 60)}`,
    );
  }
  const close = braceExtent(toks, i, formula);
  const after = toks[close + 1];
  if (after) {
    throw new PabstError(
      `unexpected text after the property body's closing '}': ${formula.slice(after.start, after.start + 60)}`,
    );
  }
  const body = formula.slice(open.end, toks[close]!.start).trim();
  if (body.length === 0) throw new PabstError(`property body is empty`);
  return { binders, body };
}

function isMembership(t: ScannedToken): boolean {
  return t.text === "∈" || t.text === "in";
}

/** Tokenize the annotation for prefix parsing. A regex literal that never
 * closes would swallow the rest of the group as one token, so its leading
 * '/' is emitted alone, scanning restarts after it, and the slash's offset
 * feeds the truncation hint. */
function prefixTokens(formula: string): {
  toks: ScannedToken[];
  unterminatedSlash: Set<number>;
} {
  const toks: ScannedToken[] = [];
  const unterminatedSlash = new Set<number>();
  let from = 0;
  scan: while (true) {
    for (const t of scanTokens(formula, from)) {
      if (
        t.kind === ts.SyntaxKind.RegularExpressionLiteral &&
        scanRegexLiteral(t.text, 0).close === -1
      ) {
        toks.push({
          kind: ts.SyntaxKind.SlashToken,
          text: "/",
          start: t.start,
          end: t.start + 1,
        });
        unterminatedSlash.add(t.start);
        from = t.start + 1;
        continue scan;
      }
      toks.push(t);
    }
    return { toks, unterminatedSlash };
  }
}

/** Index of the ')' closing the group opened at toks[open]. Guard tokens
 * never take part in paren counting: an interval's delimiters may be
 * deliberately mismatched — (0, 1] is a legal half-open interval — so a
 * membership token followed by a plausible interval is skipped atomically,
 * and a terminated regex literal is already a single token. */
function groupExtent(
  toks: ScannedToken[],
  open: number,
  formula: string,
  unterminatedSlash: Set<number>,
): number {
  let depth = 0;
  let j = open;
  while (j < toks.length) {
    if (isMembership(toks[j]!)) {
      const e = intervalExtent(toks, j + 1);
      if (e !== -1) {
        j = e + 1;
        continue;
      }
    }
    const t = toks[j]!;
    if (t.text === "(") depth++;
    else if (t.text === ")") {
      depth--;
      if (depth === 0) return j;
    }
    j++;
  }
  const sawUnterminated = [...unterminatedSlash].some(
    (at) => at >= toks[open]!.start,
  );
  const hint = sawUnterminated
    ? ` (if this is a regex guard: ${TRUNCATION_HINT})`
    : "";
  throw new PabstError(
    `unbalanced parentheses in binder group: ${formula.slice(toks[open]!.start)}${hint}`,
  );
}

/** Index of the '}' matching the '{' at toks[open]. Only genuine brace
 * tokens take part in the count: scanTokens packages string, regex, and
 * template text into single tokens and rescans a substitution-closing '}'
 * into a TemplateMiddle/TemplateTail, so every OpenBraceToken in the
 * stream has a real CloseBraceToken partner. */
function braceExtent(
  toks: ScannedToken[],
  open: number,
  formula: string,
): number {
  let depth = 0;
  for (let j = open; j < toks.length; j++) {
    const kind = toks[j]!.kind;
    if (kind === ts.SyntaxKind.OpenBraceToken) depth++;
    else if (kind === ts.SyntaxKind.CloseBraceToken) {
      depth--;
      if (depth === 0) return j;
    }
  }
  throw new PabstError(
    `unbalanced braces in property body: ${formula.slice(toks[open]!.start)}`,
  );
}

/** Index of the token closing a plausible two-endpoint interval starting at
 * toks[at], or -1 when none starts there — the group scan then proceeds as
 * usual and the guard text reaches parseRange for the precise complaint. */
function intervalExtent(toks: ScannedToken[], at: number): number {
  const open = toks[at];
  if (!open || (open.text !== "[" && open.text !== "(")) return -1;
  let commas = 0;
  for (let j = at + 1; j < toks.length; j++) {
    const text = toks[j]!.text;
    if (text === "]" || text === ")") return commas === 1 ? j : -1;
    if (text === ":") return -1;
    if (text === ",") commas++;
  }
  return -1;
}

/** binder-group ::= "(" var-name+ ":" domain constraint? ")" */
function parseBinderGroup(
  toks: ScannedToken[],
  open: number,
  close: number,
  formula: string,
): Binder[] {
  const interior = toks.slice(open + 1, close);
  const groupText = formula.slice(toks[open]!.end, toks[close]!.start).trim();
  const colon = interior.findIndex((t) => t.text === ":");
  if (colon === -1) {
    throw new PabstError(
      `binder group missing ':' — expected '(x: domain)', got: (${groupText})`,
    );
  }
  const domainToks = interior.slice(colon + 1);
  const member = domainToks.findIndex(isMembership);
  const nameEnd = member === -1 ? domainToks.length : member;
  const domainName = sliceText(formula, domainToks.slice(0, nameEnd)).trim();
  if (!isDomain(domainName)) {
    throw new PabstError(
      `unknown generation domain '${domainName}' — valid domains: int, nat, number, boolean, string, bigint`,
    );
  }
  let range: Range | undefined;
  let pattern: StringPattern | undefined;
  if (member !== -1) {
    const guardText = formula
      .slice(domainToks[member]!.end, toks[close]!.start)
      .trim();
    // A leading '/' is a regex guard when the domain is string or when
    // the literal closes (a deliberate regex on a numeric domain deserves
    // the regex-guard domain complaint). An unterminated '/' on a
    // non-string domain is more likely a mistyped '(' — fall through to
    // parseRange for the precise interval complaint.
    const regexGuard =
      guardText.startsWith("/") &&
      (domainName === "string" || scanRegexLiteral(guardText, 0).close !== -1);
    if (regexGuard) pattern = parseRegexGuard(guardText, domainName);
    else range = parseRange(guardText, domainName);
  }
  const names = adjacentRuns(interior.slice(0, colon), formula);
  if (names.length === 0) {
    throw new PabstError(`binder group has no variable names: (${groupText})`);
  }
  for (const n of names) {
    if (!NAME.test(n)) {
      throw new PabstError(`invalid binder variable name '${n}'`);
    }
  }
  return names.map((varName) => {
    const binder: Binder = { varName, domain: domainName };
    if (range) binder.range = range;
    if (pattern) binder.pattern = pattern;
    return binder;
  });
}

/** Group adjacent tokens (no gap between them) into runs; each run's source
 * text is one candidate name — the token-level analogue of splitting the
 * variable segment on whitespace, so 'x-y' stays one (invalid) name. */
function adjacentRuns(toks: ScannedToken[], formula: string): string[] {
  const runs: string[] = [];
  for (let i = 0; i < toks.length;) {
    const start = toks[i]!.start;
    let end = toks[i]!.end;
    i++;
    while (i < toks.length && toks[i]!.start === end) {
      end = toks[i]!.end;
      i++;
    }
    runs.push(formula.slice(start, end));
  }
  return runs;
}
