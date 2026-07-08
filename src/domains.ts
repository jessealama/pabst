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
    case "nat":
      // A ranged nat is just a bounded integer; fc.nat has no `min`.
      return `fc.integer({ min: ${range.min}, max: ${range.max} })`;
    case "number":
      // Bounded fc.double still generates NaN unless told otherwise,
      // and NaN satisfies no interval.
      return `fc.double({ min: ${range.min}, max: ${range.max}, noNaN: true })`;
    case "bigint":
      return `fc.bigInt({ min: ${range.min}n, max: ${range.max}n })`;
    default:
      // Unreachable via the parser (parseRange rejects these), kept as a
      // backstop for direct callers.
      throw new PabstError(
        `domain '${domain}' does not support interval constraints`,
      );
  }
}
