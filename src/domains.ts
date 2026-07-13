import { PabstError } from "./errors.js";
import type { Domain, Range, StringPattern } from "./ir.js";
import { anchoredSource } from "./regex-guard.js";

export const DOMAIN_TABLE: Record<Domain, string> = {
  int: "fc.integer()",
  nat: "fc.nat()",
  number: "fc.double()",
  boolean: "fc.boolean()",
  string: "fc.string()",
  bigint: "fc.bigInt()",
};

export function isDomain(s: string): s is Domain {
  return Object.prototype.hasOwnProperty.call(DOMAIN_TABLE, s);
}

export const MAX_SAFE = 9007199254740991n;

export interface IntBounds {
  lo: bigint;
  hi: bigint;
  /** A finite endpoint fell outside the safe integer range, so the
   * interval was intersected with it (possibly to emptiness: lo > hi). */
  clamped: boolean;
}

/** The inclusive fc.integer bounds an int/nat interval lowers to: open
 * endpoints fold into ±1 (fc.integer has no exclusion options), nat floors
 * at 0, and the result is intersected with the safe integer range. Both
 * sides are always concrete — fc.integer's implicit defaults are 32-bit,
 * so a far-out explicit bound with an omitted side would crash it — and an
 * unbounded (∞) side means the safe-range limit. */
export function intBounds(domain: "int" | "nat", range: Range): IntBounds {
  let lo =
    range.min === undefined
      ? -MAX_SAFE
      : BigInt(range.min) + (range.minOpen ? 1n : 0n);
  let hi =
    range.max === undefined
      ? MAX_SAFE
      : BigInt(range.max) - (range.maxOpen ? 1n : 0n);
  if (domain === "nat" && lo < 0n) lo = 0n;
  const clamped =
    lo < -MAX_SAFE || lo > MAX_SAFE || hi < -MAX_SAFE || hi > MAX_SAFE;
  if (lo < -MAX_SAFE) lo = -MAX_SAFE;
  if (hi > MAX_SAFE) hi = MAX_SAFE;
  return { lo, hi, clamped };
}

/** The inclusive fc.bigInt bounds a bigint interval lowers to. An
 * unbounded side stays undefined — fc.bigInt, unlike fc.integer, widens
 * its default range around a far-out explicit bound. */
export function bigintBounds(range: Range): { lo?: bigint; hi?: bigint } {
  const lo =
    range.min === undefined
      ? undefined
      : BigInt(range.min) + (range.minOpen ? 1n : 0n);
  const hi =
    range.max === undefined
      ? undefined
      : BigInt(range.max) - (range.maxOpen ? 1n : 0n);
  const bounds: { lo?: bigint; hi?: bigint } = {};
  if (lo !== undefined) bounds.lo = lo;
  if (hi !== undefined) bounds.hi = hi;
  return bounds;
}

/** One endpoint of a number interval as fc.double sees it: the literal
 * text emitted into the generated test, and its numeric value (used to
 * validate the constraints with fc itself at parse time). */
export interface NumberBound {
  lit: string;
  val: number;
}

export interface NumberConstraints {
  min?: NumberBound;
  minExcluded: boolean;
  max?: NumberBound;
  maxExcluded: boolean;
}

/** The fc.double constraints a number interval lowers to. An open ∞
 * endpoint becomes an excluded infinite bound, which fast-check clamps to
 * ±MAX_VALUE; a closed ∞ endpoint is fc.double's default (inclusive ±∞),
 * so that side is simply omitted. */
export function numberConstraints(range: Range): NumberConstraints {
  const c: NumberConstraints = {
    minExcluded: range.minOpen === true,
    maxExcluded: range.maxOpen === true,
  };
  if (range.min !== undefined) {
    c.min = { lit: range.min, val: Number(range.min) };
  } else if (range.minOpen) {
    c.min = { lit: "Number.NEGATIVE_INFINITY", val: Number.NEGATIVE_INFINITY };
  }
  if (range.max !== undefined) {
    c.max = { lit: range.max, val: Number(range.max) };
  } else if (range.maxOpen) {
    c.max = { lit: "Number.POSITIVE_INFINITY", val: Number.POSITIVE_INFINITY };
  }
  return c;
}

export function arbitraryFor(
  domain: Domain,
  range?: Range,
  pattern?: StringPattern,
): string {
  if (pattern) {
    if (domain !== "string") {
      // Unreachable via the parser (parseRegexGuard rejects these), kept
      // as a backstop for direct callers.
      throw new PabstError(
        `domain '${domain}' does not support ∈ regex guards — only string does`,
      );
    }
    // Safe to re-emit as a literal: the source came from a literal scan,
    // so any '/' in it is escaped or inside a character class.
    return `fc.stringMatching(/${anchoredSource(pattern.source)}/${pattern.flags})`;
  }
  if (!range) return DOMAIN_TABLE[domain];
  switch (domain) {
    case "int":
    case "nat": {
      // A ranged nat is just a bounded integer; fc.nat has no `min`.
      const { lo, hi } = intBounds(domain, range);
      return `fc.integer({ min: ${lo}, max: ${hi} })`;
    }
    case "number": {
      // Bounded fc.double still generates NaN unless told otherwise, and
      // NaN satisfies no interval.
      const c = numberConstraints(range);
      const opts: string[] = [];
      if (c.min) opts.push(`min: ${c.min.lit}`);
      if (c.minExcluded) opts.push(`minExcluded: true`);
      if (c.max) opts.push(`max: ${c.max.lit}`);
      if (c.maxExcluded) opts.push(`maxExcluded: true`);
      opts.push(`noNaN: true`);
      return `fc.double({ ${opts.join(", ")} })`;
    }
    case "bigint": {
      const { lo, hi } = bigintBounds(range);
      return `fc.bigInt${render(
        lo === undefined ? undefined : `min: ${lo}n`,
        hi === undefined ? undefined : `max: ${hi}n`,
      )}`;
    }
    default:
      // Unreachable via the parser (parseRange rejects these), kept as a
      // backstop for direct callers.
      throw new PabstError(
        `domain '${domain}' does not support interval constraints`,
      );
  }
}

function render(...opts: Array<string | undefined>): string {
  const present = opts.filter((o): o is string => o !== undefined);
  return present.length === 0 ? "()" : `({ ${present.join(", ")} })`;
}
