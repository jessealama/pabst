import { stringMatching } from "fast-check";
import { PabstError } from "./errors.js";
import type { Domain, StringPattern } from "./ir.js";

// A line comment on purpose: spelling star-slash inside a block comment
// would end it — which is exactly the hazard this hint is about. An
// unterminated literal is the telltale symptom of a pattern whose "*/"
// ended the enclosing JSDoc comment early.
export const TRUNCATION_HINT =
  "a '*/' inside a pattern ends the enclosing JSDoc comment early — " +
  "write {0,} instead of a trailing *, or wrap it in (?:...)";

const FLAG_ERRORS: Record<string, string> = {
  m:
    "regex flag 'm' would let the pattern match a single line inside a " +
    "longer string, but ∈ guards match the whole string",
  i: "regex flag 'i' is not supported by fast-check's string generator",
  v: "regex flag 'v' is not supported by fast-check's string generator",
  g: "regex flag 'g' has no effect on generation",
  y: "regex flag 'y' has no effect on generation",
  d: "regex flag 'd' has no effect on generation",
};

export interface RegexScan {
  /** Index just past the literal (closing '/' plus flags), or text.length
   * if the literal never closes. */
  end: number;
  /** Index of the closing '/', or -1 if the literal never closes. */
  close: number;
}

const LINE_TERMINATOR = /[\n\r\u2028\u2029]/;

/** Scan a JS regex literal starting at text[start] === '/'. Tracks
 * backslash escapes and [...] character classes, so '(', ')' and '/'
 * inside them do not close the literal. A line terminator — even after a
 * backslash, which cannot escape one — ends the scan unterminated, as in
 * JS source; admitting one would re-emit it inside a regex literal in the
 * generated spec, where it is a SyntaxError. */
export function scanRegexLiteral(text: string, start: number): RegexScan {
  let inClass = false;
  for (let i = start + 1; i < text.length; i++) {
    const c = text[i]!;
    if (LINE_TERMINATOR.test(c)) break;
    if (c === "\\") {
      const next = text[i + 1];
      if (next === undefined || LINE_TERMINATOR.test(next)) break;
      i++;
    } else if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) {
      const close = i;
      i++;
      while (i < text.length && /[a-zA-Z]/.test(text[i]!)) i++;
      return { end: i, close };
    }
  }
  return { end: text.length, close: -1 };
}

/** Full-string semantics: '∈ /re/' denotes the language of re, so lowering
 * wraps the pattern before handing it to fc.stringMatching. */
export function anchoredSource(source: string): string {
  return `^(?:${source})$`;
}

/** The complaint a regex guard on a non-string domain raises; shared with
 * arbitraryFor's backstop so the two throw sites cannot drift apart. */
export function regexGuardDomainError(domain: Domain): PabstError {
  return new PabstError(
    `domain '${domain}' does not support ∈ regex guards — only string does`,
  );
}

/** Parse and validate a regex guard like "/^[a-z]+$/u". Source and flags
 * are kept verbatim; anchoring happens at lowering. Validation probes
 * fast-check itself — a peer dependency, so it resolves to the same copy
 * the generated spec runs against and the accepted subset cannot drift. */
export function parseRegexGuard(text: string, domain: Domain): StringPattern {
  if (domain !== "string") {
    throw regexGuardDomainError(domain);
  }
  const { end, close } = scanRegexLiteral(text, 0);
  if (close === -1) {
    throw new PabstError(
      `unterminated regular expression (in: ${text}) — ${TRUNCATION_HINT}`,
    );
  }
  if (end !== text.length) {
    throw new PabstError(
      `unexpected text after regular expression: '${text.slice(end).trim()}' (in: ${text})`,
    );
  }
  const source = text.slice(1, close);
  const flags = text.slice(close + 1, end);
  if (source.length === 0) {
    throw new PabstError(
      "empty regular expression after ∈ — to generate only the empty string, use ∈ /^$/",
    );
  }
  for (const f of flags) {
    if (f === "s" || f === "u") continue;
    const why = FLAG_ERRORS[f] ?? `regex flag '${f}' is not supported`;
    throw new PabstError(`${why} (allowed flags: s, u; in: ${text})`);
  }
  try {
    new RegExp(source, flags);
  } catch (e) {
    throw new PabstError(
      `invalid regular expression (in: ${text}): ${(e as Error).message}`,
    );
  }
  try {
    stringMatching(new RegExp(anchoredSource(source), flags));
  } catch (e) {
    throw new PabstError(
      `regular expression not supported by fast-check (in: ${text}): ${(e as Error).message}`,
    );
  }
  return { source, flags };
}
