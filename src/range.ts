import { PabstError } from "./errors.js";
import type { Domain, Range } from "./ir.js";

const INT_LITERAL = /^[+-]?\d+$/;
const BIGINT_LITERAL = /^[+-]?\d+n?$/;
const NUMBER_LITERAL = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

const MAX_SAFE = 9007199254740991n;

export function isNumericDomain(d: Domain): boolean {
  return d === "int" || d === "nat" || d === "number" || d === "bigint";
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
  const close = text.search(/[\])]/);
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
  const min = parseEndpoint(parts[0]!.trim(), domain);
  const max = parseEndpoint(parts[1]!.trim(), domain);
  if (domain === "number") {
    validateNumberInterval(min, max, minOpen, maxOpen, text);
  } else {
    validateIntegerInterval(min, max, minOpen, maxOpen, domain, text);
  }
  const range: Range = {};
  if (min !== undefined) range.min = min;
  if (max !== undefined) range.max = max;
  if (minOpen) range.minOpen = true;
  if (maxOpen) range.maxOpen = true;
  return range;
}

/** An open integer bound excludes exactly one value, so validity is judged
 * on the ±1-adjusted bounds — the same adjustment lowering applies, since
 * fc.integer/fc.bigInt have no exclusion options. */
function validateIntegerInterval(
  min: string | undefined,
  max: string | undefined,
  minOpen: boolean,
  maxOpen: boolean,
  domain: Domain,
  text: string,
): void {
  const eMin =
    min === undefined ? undefined : BigInt(min) + (minOpen ? 1n : 0n);
  const eMax =
    max === undefined ? undefined : BigInt(max) - (maxOpen ? 1n : 0n);
  if (domain === "nat" && eMin !== undefined && eMin < 0n) {
    throw new PabstError(
      `nat interval cannot include negative values (in: ${text})`,
    );
  }
  const lo = domain === "nat" && eMin === undefined ? 0n : eMin;
  if (lo !== undefined && eMax !== undefined && lo > eMax) {
    throw new PabstError(`empty interval: no ${domain} satisfies ${text}`);
  }
  if (domain !== "bigint") {
    for (const e of [eMin, eMax]) {
      if (e !== undefined && (e > MAX_SAFE || e < -MAX_SAFE)) {
        throw new PabstError(
          `interval endpoint, adjusted ±1 for its open bound (${e}), ` +
            `is outside the safe integer range (in: ${text})`,
        );
      }
    }
  }
}

function validateNumberInterval(
  min: string | undefined,
  max: string | undefined,
  minOpen: boolean,
  maxOpen: boolean,
  text: string,
): void {
  if (min === undefined || max === undefined) return;
  const lo = Number(min);
  const hi = Number(max);
  if (lo > hi) {
    throw new PabstError(`empty interval: ${min} > ${max} (in: ${text})`);
  }
  if (lo !== hi) return;
  if (minOpen || maxOpen) {
    // minExcluded/maxExcluded exclude both zeros, matching numeric
    // equality, so (-0, 0] and [-0, 0) are as empty as (1, 1].
    throw new PabstError(
      `empty interval: ${text} contains no values (equal endpoints with an excluded bound)`,
    );
  }
  // fast-check orders -0 below +0, so [0, -0] is empty for fc.double.
  if (lo === 0 && Object.is(hi, -0) && !Object.is(lo, -0)) {
    throw new PabstError(
      `empty interval: ${min} > ${max} (in: ${text})` +
        ` — fast-check orders -0 below 0, so this interval contains no values`,
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
      if (!Number.isSafeInteger(Number(lit)))
        throw new PabstError(
          `interval endpoint '${lit}' is outside the safe integer range`,
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
