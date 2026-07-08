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
  if (!text.endsWith("]")) {
    // A half-open "[1, 30)" loses its ')' to the binder-group scanner,
    // so a missing ']' is the usual symptom of attempted open bounds.
    throw new PabstError(
      `interval is missing its closing ']' (in: ${text}) — ${OPEN_HINT}`,
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
    throw new PabstError(`empty interval: ${min} > ${max} (in: ${text})`);
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
      return stripPlus(lit);
    }
    case "bigint": {
      if (!BIGINT_LITERAL.test(lit))
        throw new PabstError(
          `interval endpoint '${lit}' is not an integer literal (domain bigint)`,
        );
      return stripPlus(lit.endsWith("n") ? lit.slice(0, -1) : lit);
    }
    default: {
      if (!NUMBER_LITERAL.test(lit) || !Number.isFinite(Number(lit)))
        throw new PabstError(
          `interval endpoint '${lit}' is not a finite number literal`,
        );
      return lit;
    }
  }
}

function stripPlus(lit: string): string {
  return lit.startsWith("+") ? lit.slice(1) : lit;
}

function isEmptyInterval(min: string, max: string, domain: Domain): boolean {
  if (domain === "number") return Number(min) > Number(max);
  return BigInt(min) > BigInt(max);
}
