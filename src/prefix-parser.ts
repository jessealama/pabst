import { isDomain } from "./domains.js";
import { PabstError } from "./errors.js";
import type { Binder } from "./ir.js";
import { parseRange } from "./range.js";

export interface ParsedPrefix {
  binders: Binder[];
  body: string;
}

const FORALL = /^\s*(?:forall|∀)\s*/;

const MEMBERSHIP = /∈|\bin\b/;

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
 * no interval starts at j. */
function intervalAtomEnd(formula: string, j: number): number {
  let k: number;
  if (formula[j] === "∈") {
    k = j + 1;
  } else if (
    formula.startsWith("in", j) &&
    !/[A-Za-z0-9_]/.test(formula[j - 1] ?? " ") &&
    !/[A-Za-z0-9_]/.test(formula[j + 2] ?? " ")
  ) {
    k = j + 2;
  } else {
    return -1;
  }
  while (k < formula.length && /\s/.test(formula[k]!)) k++;
  if (formula[k] !== "(" && formula[k] !== "[") return -1;
  for (k++; k < formula.length; k++) {
    if (formula[k] === ")" || formula[k] === "]") return k + 1;
  }
  return -1;
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
  const mem = MEMBERSHIP.exec(domainPart);
  if (mem) {
    domainName = domainPart.slice(0, mem.index).trim();
    rangeText = domainPart.slice(mem.index + mem[0].length).trim();
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
