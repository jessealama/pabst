import fc from "fast-check";
import type { DoubleConstraints } from "fast-check";
import { bigintBounds, intBounds, numberConstraints } from "./domains.js";
import { PabstError } from "./errors.js";
import type { Domain, Range } from "./ir.js";

const INT_LITERAL = /^[+-]?\d+$/;
const BIGINT_LITERAL = /^[+-]?\d+n?$/;
const NUMBER_LITERAL = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
const INFINITE_LITERAL = /^([+-]?)(?:∞|Infinity)$/;

export function isNumericDomain(d: Domain): boolean {
  return d === "int" || d === "nat" || d === "number" || d === "bigint";
}

/** Interval delimiters may be deliberately mismatched — (0, 1] is legal —
 * so the FIRST of ']' or ')' always closes an interval. This regex is the
 * single definition of that rule; parseRange and scanIntervalExtent both
 * scan with it. */
const CLOSE_DELIM = /[\])]/;

/** The index just past the membership token (∈, or the word 'in') starting
 * at `i`, or -1 if none starts there. The single definition of the
 * membership spelling, shared by the binder-group scanner and splitter. */
export function membershipEnd(text: string, i: number): number {
  if (text[i] === "∈") return i + 1;
  if (
    text.startsWith("in", i) &&
    !/[A-Za-z0-9_]/.test(text[i - 1] ?? " ") &&
    !/[A-Za-z0-9_]/.test(text[i + 2] ?? " ")
  ) {
    return i + 2;
  }
  return -1;
}

/** Where an interval starting at `at` ends: the index just past its
 * closing delimiter, or -1 when no interval can start at `at` — the
 * character there is not '[' or '(', no closing delimiter follows, or the
 * delimited text cannot be a two-endpoint interval (a second comma, or a
 * ':', means the delimiter swallowed neighboring binder text: typically a
 * forgotten ']'). On -1 the caller's fallback path reaches parseRange,
 * whose scan of the same text yields the precise complaint. */
export function scanIntervalExtent(text: string, at: number): number {
  if (text[at] !== "[" && text[at] !== "(") return -1;
  const close = text.slice(at + 1).search(CLOSE_DELIM);
  if (close === -1) return -1;
  const interior = text.slice(at + 1, at + 1 + close);
  if (interior.includes(":") || interior.split(",").length !== 2) return -1;
  return at + close + 2;
}

/** Parse and validate an interval constraint like "[1, 30]" or "(0, 1]".
 * A round bracket excludes its endpoint. */
export function parseRange(text: string, domain: Domain): Range {
  if (!isNumericDomain(domain)) {
    throw new PabstError(
      `domain '${domain}' does not support ∈ interval constraints — ` +
        `only int, nat, number, and bigint do`,
    );
  }
  const minOpen = text.startsWith("(");
  if (!minOpen && !text.startsWith("[")) {
    throw new PabstError(
      `expected interval '[lo, hi]' or '(lo, hi]' after ∈, got: ${text || "(nothing)"}`,
    );
  }
  const close = text.search(CLOSE_DELIM);
  if (close === -1) {
    throw new PabstError(
      `interval is missing its closing ']' or ')' (in: ${text})`,
    );
  }
  if (close !== text.length - 1) {
    throw new PabstError(
      `unexpected text after interval: '${text.slice(close + 1).trim()}' (in: ${text})`,
    );
  }
  const maxOpen = text[close] === ")";
  const parts = text.slice(1, close).split(",");
  if (parts.length !== 2) {
    throw new PabstError(
      `expected exactly two endpoints '[lo, hi]', got: ${text}`,
    );
  }
  const min = parseBound(parts[0]!.trim(), "lower", minOpen, domain);
  const max = parseBound(parts[1]!.trim(), "upper", maxOpen, domain);
  const range: Range = {};
  if (min !== undefined) range.min = min;
  if (max !== undefined) range.max = max;
  if (minOpen) range.minOpen = true;
  if (maxOpen) range.maxOpen = true;
  if (domain === "number") {
    validateNumberInterval(range, text);
  } else {
    validateIntegerInterval(domain, range, text);
  }
  return range;
}

/** Returns the normalized endpoint literal, or undefined for an unbounded
 * (±∞) endpoint. */
function parseBound(
  lit: string,
  side: "lower" | "upper",
  open: boolean,
  domain: Domain,
): string | undefined {
  const inf = INFINITE_LITERAL.exec(lit);
  if (!inf) return parseEndpoint(lit, domain);
  if (side === "lower" && inf[1] !== "-") {
    throw new PabstError(
      `an interval's lower endpoint cannot be +∞ (in endpoint '${lit}')`,
    );
  }
  if (side === "upper" && inf[1] === "-") {
    throw new PabstError(
      `an interval's upper endpoint cannot be -∞ (in endpoint '${lit}')`,
    );
  }
  if (domain !== "number" && !open) {
    throw new PabstError(
      `${domain} has no infinite values, so an ∞ endpoint must be open — ` +
        `use ${side === "lower" ? `'(${lit},'` : `'${lit})'`} (a closed ∞ ` +
        `bound is only meaningful for number, where Infinity is a value)`,
    );
  }
  return undefined;
}

/** Validity is judged on the exact bounds lowering will emit (intBounds /
 * bigintBounds fold open endpoints into ±1, floor nat at 0, and intersect
 * int/nat with the safe integer range), so validation and generation can
 * never disagree. A nat interval reaching below 0 clamps — `(-2, 5]` and
 * `(-∞, 5]` denote the same naturals — and an int/nat endpoint beyond the
 * safe range clamps with a warning; either is an error only when nothing
 * satisfiable remains. */
function validateIntegerInterval(domain: Domain, range: Range, text: string) {
  if (domain === "bigint") {
    const { lo, hi } = bigintBounds(range);
    if (lo !== undefined && hi !== undefined && lo > hi) {
      throw new PabstError(`empty interval: no bigint satisfies ${text}`);
    }
    return;
  }
  const { lo, hi, clamped } = intBounds(domain as "int" | "nat", range);
  if (lo > hi) {
    throw new PabstError(
      `empty interval: no ${domain}${clamped ? " within the safe integer range (±9007199254740991)" : ""} satisfies ${text}`,
    );
  }
  if (clamped) {
    console.error(
      `warning: interval ${text} extends beyond the safe integer range; ` +
        `${domain} generation is clamped to [${lo}, ${hi}]`,
    );
  }
}

/** A number interval denotes a set of fc-generatable doubles, so emptiness
 * is fast-check's call, not ours: constructing the exact fc.double
 * constraints lowering will emit lets fc apply its own ordering, in which
 * every double is distinct — -0 sits below 0 (so [0, -0] is empty but
 * (-0, 0] is the singleton {0}) and an excluded bound removes exactly one
 * double, by adjacency rather than numeric equality (so [-1, 0) can
 * generate -0, and (0, 5e-324) is empty). */
function validateNumberInterval(range: Range, text: string): void {
  const c = numberConstraints(range);
  const opts: DoubleConstraints = {
    noNaN: true,
    minExcluded: c.minExcluded,
    maxExcluded: c.maxExcluded,
  };
  if (c.min) opts.min = c.min.val;
  if (c.max) opts.max = c.max.val;
  try {
    fc.double(opts);
  } catch {
    throw new PabstError(
      `empty interval: no number satisfies ${text} (fast-check treats every ` +
        `double as distinct — it orders -0 below 0, and an excluded bound ` +
        `removes exactly one double)`,
    );
  }
}

function parseEndpoint(lit: string, domain: Domain): string {
  switch (domain) {
    case "int":
    case "nat": {
      if (!INT_LITERAL.test(lit))
        throw new PabstError(
          `interval endpoint '${lit}' is not an integer literal (domain ${domain})`,
        );
      return normalizeLiteral(lit);
    }
    case "bigint": {
      if (!BIGINT_LITERAL.test(lit))
        throw new PabstError(
          `interval endpoint '${lit}' is not an integer literal (domain bigint)`,
        );
      return normalizeLiteral(lit.endsWith("n") ? lit.slice(0, -1) : lit);
    }
    default: {
      if (!NUMBER_LITERAL.test(lit) || !Number.isFinite(Number(lit)))
        throw new PabstError(
          `interval endpoint '${lit}' is not a finite number literal`,
        );
      return normalizeLiteral(lit);
    }
  }
}

/** Strip a leading '+' and redundant leading zeros: endpoints are emitted
 * verbatim into an ES module, where '010' is a SyntaxError. The lookahead
 * keeps a lone (possibly signed) zero intact, so '-0' survives. */
function normalizeLiteral(lit: string): string {
  const unsigned = lit.startsWith("+") ? lit.slice(1) : lit;
  return unsigned.replace(/^(-?)0+(?=\d)/, "$1");
}
