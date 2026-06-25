import type { Domain } from "./ir.js";

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

export function arbitraryFor(domain: Domain): string {
  return DOMAIN_TABLE[domain];
}
