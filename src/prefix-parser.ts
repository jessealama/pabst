import { isDomain } from "./domains.js";
import { PabstError } from "./errors.js";
import type { Binder } from "./ir.js";
import { membershipEnd, parseRange, scanIntervalExtent } from "./range.js";

export interface ParsedPrefix {
  binders: Binder[];
  body: string;
}

const FORALL = /^\s*(?:forall|∀)\s*/;

export function parsePrefix(formula: string): ParsedPrefix {
  if (/^\s*(?:∃|exists\b)/.test(formula)) {
    throw new PabstError(
      "existential quantifiers (∃ / exists) are not supported: property-based " +
        "testing samples inputs, so it can refute ∀ with a counterexample but cannot " +
        "soundly confirm ∃ (a bounded/exhaustive mode would be needed)",
    );
  }
  const m = FORALL.exec(formula);
  if (!m) {
    throw new PabstError(
      `expected 'forall' (or ∀) at start of property: ${formula.trim().slice(0, 60)}`,
    );
  }
  let i = m[0].length;
  const binders: Binder[] = [];

  while (true) {
    while (i < formula.length && /\s/.test(formula[i]!)) i++;
    if (formula[i] !== "(") break;
    const start = i;
    let depth = 0;
    let j = i;
    while (j < formula.length) {
      const atomEnd = intervalAtomEnd(formula, j);
      if (atomEnd !== -1) {
        j = atomEnd;
        continue;
      }
      const c = formula[j]!;
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
      j++;
    }
    if (depth !== 0) {
      throw new PabstError(
        `unbalanced parentheses in binder group: ${formula.slice(start)}`,
      );
    }
    binders.push(...parseBinderGroup(formula.slice(start + 1, j - 1)));
    i = j;
  }

  if (binders.length === 0) {
    throw new PabstError(
      `expected at least one binder group '(x: domain)' after forall`,
    );
  }

  while (i < formula.length && /\s/.test(formula[i]!)) i++;
  if (formula[i] !== ",") {
    throw new PabstError(
      `expected ',' separating binders from body, got: ${formula.slice(i, i + 60)}`,
    );
  }
  i++;
  const body = formula.slice(i).trim();
  if (body.length === 0) throw new PabstError(`property body is empty`);
  return { binders, body };
}

/** Interval delimiters may be deliberately mismatched — (0, 1] is a legal
 * half-open interval — so the group scanner consumes '∈/in ⟨( or [⟩ …
 * ⟨) or ]⟩' as one atom whose brackets never take part in paren counting.
 * Returns the index just past the interval's closing delimiter, or -1 when
 * no interval starts at j — then the characters take part in paren
 * counting as usual, and whatever text ends up after the membership token
 * reaches parseRange for the precise complaint. */
function intervalAtomEnd(formula: string, j: number): number {
  const k = membershipEnd(formula, j);
  if (k === -1) return -1;
  let d = k;
  while (d < formula.length && /\s/.test(formula[d]!)) d++;
  return scanIntervalExtent(formula, d);
}

function parseBinderGroup(group: string): Binder[] {
  const colon = group.indexOf(":");
  if (colon === -1)
    throw new PabstError(
      `binder group missing ':' — expected '(x: domain)', got: (${group})`,
    );
  const varsPart = group.slice(0, colon).trim();
  const domainPart = group.slice(colon + 1).trim();
  let domainName = domainPart;
  let rangeText: string | undefined;
  for (let j = 0; j < domainPart.length; j++) {
    const end = membershipEnd(domainPart, j);
    if (end !== -1) {
      domainName = domainPart.slice(0, j).trim();
      rangeText = domainPart.slice(end).trim();
      break;
    }
  }
  if (!isDomain(domainName)) {
    throw new PabstError(
      `unknown generation domain '${domainName}' — valid domains: int, nat, number, boolean, string, bigint`,
    );
  }
  const range =
    rangeText === undefined ? undefined : parseRange(rangeText, domainName);
  const names = varsPart.split(/\s+/).filter(Boolean);
  if (names.length === 0)
    throw new PabstError(`binder group has no variable names: (${group})`);
  for (const n of names) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(n))
      throw new PabstError(`invalid binder variable name '${n}'`);
  }
  return names.map((varName) =>
    range
      ? { varName, domain: domainName, range }
      : { varName, domain: domainName },
  );
}
