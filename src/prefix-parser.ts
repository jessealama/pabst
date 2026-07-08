import { isDomain } from "./domains.js";
import { PabstError } from "./errors.js";
import type { Binder } from "./ir.js";
import { parseRange } from "./range.js";

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
    for (; j < formula.length; j++) {
      const c = formula[j]!;
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          j++;
          break;
        }
      }
    }
    if (depth !== 0) {
      const rest = formula.slice(start);
      const openInterval = /(?:∈|\bin\b)\s*\(/.test(rest)
        ? " (open/half-open intervals like (0, 1] are not supported; " +
          "use closed bounds [lo, hi])"
        : "";
      throw new PabstError(
        `unbalanced parentheses in binder group: ${rest}${openInterval}`,
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
  const mem = /∈|\bin\b/.exec(domainPart);
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
