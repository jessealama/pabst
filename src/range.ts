import { PabstError } from "./errors.js";
import type { Domain, Range } from "./ir.js";

const OPEN_HINT =
  "open/half-open intervals are not supported; use closed bounds, " +
  "e.g. ∈ [1, 29] instead of ∈ [1, 30)";

const INT_LITERAL = /^[+-]?\d+$/;
const BIGINT_LITERAL = /^[+-]?\d+n?$/;
const NUMBER_LITERAL = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

export function isNumericDomain(d: Domain): boolean {
  return d === "int" || d === "nat" || d === "number" || d === "bigint";
}

/** Parse and validate a closed-interval constraint like "[1, 30]". */
export function parseRange(text: string, domain: Domain): Range {
  if (!isNumericDomain(domain)) {
    throw new PabstError(
      `domain '${domain}' does not support ∈ interval constraints — ` +
        `only int, nat, number, and bigint do`,
    );
  }
  if (text.startsWith("(") || text.endsWith(")")) {
    throw new PabstError(OPEN_HINT);
  }
  if (!text.startsWith("[")) {
    throw new PabstError(
      `expected interval '[lo, hi]' after ∈, got: ${text || "(nothing)"}`,
    );
  }
  const close = text.indexOf("]");
  if (close === -1) {
    // A half-open "[1, 30)" loses its ')' to the binder-group scanner,
    // so a missing ']' is the usual symptom of attempted open bounds.
    throw new PabstError(
      `interval is missing its closing ']' (in: ${text}) — ${OPEN_HINT}`,
    );
  }
  if (close !== text.length - 1) {
    throw new PabstError(
      `unexpected text after interval: '${text.slice(close + 1).trim()}' (in: ${text})`,
    );
  }
  const parts = text.slice(1, -1).split(",");
  if (parts.length !== 2) {
    throw new PabstError(
      `expected exactly two endpoints '[lo, hi]', got: ${text}`,
    );
  }
  const min = parseEndpoint(parts[0]!.trim(), domain);
  const max = parseEndpoint(parts[1]!.trim(), domain);
  if (isEmptyInterval(min, max, domain)) {
    const zeroNote =
      domain === "number" && Number(min) === 0 && Number(max) === 0
        ? " — fast-check orders -0 below 0, so this interval contains no values"
        : "";
    throw new PabstError(
      `empty interval: ${min} > ${max} (in: ${text})${zeroNote}`,
    );
  }
  if (domain === "nat" && BigInt(min) < 0n) {
    throw new PabstError(
      `nat interval cannot include negative values (in: ${text})`,
    );
  }
  return { min, max };
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

function isEmptyInterval(min: string, max: string, domain: Domain): boolean {
  if (domain !== "number") return BigInt(min) > BigInt(max);
  const lo = Number(min);
  const hi = Number(max);
  if (lo > hi) return true;
  // fast-check orders -0 below +0, so [0, -0] is empty for fc.double.
  return lo === 0 && hi === 0 && Object.is(hi, -0) && !Object.is(lo, -0);
}
