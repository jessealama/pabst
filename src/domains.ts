import { PabstError } from "./errors.js";
import type { Domain, Range } from "./ir.js";

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

export function arbitraryFor(domain: Domain, range?: Range): string {
  if (!range) return DOMAIN_TABLE[domain];
  switch (domain) {
    case "int":
    case "nat": {
      // A ranged nat is just a bounded integer; fc.nat has no `min`. An
      // unbounded nat side still needs min: 0 — fc.integer's default min
      // is negative.
      let min = adjust(range.min, range.minOpen, 1n);
      if (domain === "nat" && (min === undefined || BigInt(min) < 0n)) {
        min = "0";
      }
      const max = adjust(range.max, range.maxOpen, -1n);
      return `fc.integer${render(bound("min", min), bound("max", max))}`;
    }
    case "number": {
      // Bounded fc.double still generates NaN unless told otherwise, and
      // NaN satisfies no interval. An open ∞ endpoint is emitted as an
      // excluded infinite bound, which fast-check clamps to ±MAX_VALUE; a
      // closed ∞ endpoint is fc.double's default (inclusive ±∞), so that
      // side is simply omitted.
      const opts: string[] = [];
      if (range.min !== undefined) opts.push(`min: ${range.min}`);
      else if (range.minOpen) opts.push(`min: Number.NEGATIVE_INFINITY`);
      if (range.minOpen) opts.push(`minExcluded: true`);
      if (range.max !== undefined) opts.push(`max: ${range.max}`);
      else if (range.maxOpen) opts.push(`max: Number.POSITIVE_INFINITY`);
      if (range.maxOpen) opts.push(`maxExcluded: true`);
      opts.push(`noNaN: true`);
      return `fc.double({ ${opts.join(", ")} })`;
    }
    case "bigint": {
      const min = adjust(range.min, range.minOpen, 1n);
      const max = adjust(range.max, range.maxOpen, -1n);
      return `fc.bigInt${render(bound("min", min, "n"), bound("max", max, "n"))}`;
    }
    default:
      // Unreachable via the parser (parseRange rejects these), kept as a
      // backstop for direct callers.
      throw new PabstError(
        `domain '${domain}' does not support interval constraints`,
      );
  }
}

/** Fold an open endpoint into the bound itself: fc.integer and fc.bigInt
 * have no exclusion options, so (0, 10) becomes min 1 / max 9. */
function adjust(
  lit: string | undefined,
  open: boolean | undefined,
  delta: bigint,
): string | undefined {
  if (lit === undefined) return undefined;
  return open ? (BigInt(lit) + delta).toString() : lit;
}

function bound(
  name: string,
  value: string | undefined,
  suffix = "",
): string | undefined {
  return value === undefined ? undefined : `${name}: ${value}${suffix}`;
}

function render(...opts: Array<string | undefined>): string {
  const present = opts.filter((o): o is string => o !== undefined);
  return present.length === 0 ? "()" : `({ ${present.join(", ")} })`;
}
