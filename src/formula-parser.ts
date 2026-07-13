import type { Formula } from "./formula-ast.js";
import { lexFormula, sliceText, type FToken } from "./formula-lexer.js";
import { PabstError } from "./errors.js";
import { desugarEquations } from "./equations.js";

export function parseBody(body: string): Formula {
  const toks = lexFormula(body);
  return parseFormula(toks, 0, toks.length, body);
}

/** A cursor over toks[pos, end) — one per (sub-)formula parse. */
interface Cursor {
  toks: FToken[];
  pos: number;
  end: number;
  src: string;
}

const BINARY = new Set<FToken["kind"]>(["and", "or", "implies", "iff"]);

/** formula ::= equivalence   (docs/grammar.ebnf) — must consume the whole range. */
function parseFormula(
  toks: FToken[],
  start: number,
  end: number,
  src: string,
): Formula {
  const c: Cursor = { toks, pos: start, end, src };
  const f = parseEquivalence(c);
  if (c.pos !== c.end) {
    throw new PabstError(
      `unbalanced parentheses in formula: unexpected '${c.toks[c.pos]!.text}' (in: ${src})`,
    );
  }
  return f;
}

/** equivalence ::= implication (IFF implication)?   — non-associative. */
function parseEquivalence(c: Cursor): Formula {
  const left = parseImplication(c);
  if (peek(c)?.kind !== "iff") return left;
  c.pos++;
  const right = parseImplication(c);
  if (peek(c)?.kind === "iff") {
    throw new PabstError(
      "chained ↔ is ambiguous: parenthesize, e.g. (a ↔ b) ↔ c",
    );
  }
  return { kind: "iff", left, right };
}

/** implication ::= disjunction (IMPLIES disjunction)*
 * A chain a → b → c makes every segment but the last an antecedent. */
function parseImplication(c: Cursor): Formula {
  const segs = [parseDisjunction(c)];
  while (peek(c)?.kind === "implies") {
    c.pos++;
    segs.push(parseDisjunction(c));
  }
  if (segs.length === 1) return segs[0]!;
  return {
    kind: "implication",
    antecedents: segs.slice(0, -1),
    consequent: segs[segs.length - 1]!,
  };
}

/** disjunction ::= conjunction (OR conjunction)*   — left-associative. */
function parseDisjunction(c: Cursor): Formula {
  let f = parseConjunction(c);
  while (peek(c)?.kind === "or") {
    c.pos++;
    f = { kind: "or", left: f, right: parseConjunction(c) };
  }
  return f;
}

/** conjunction ::= negation (AND negation)*   — left-associative. */
function parseConjunction(c: Cursor): Formula {
  let f = parseNegation(c);
  while (peek(c)?.kind === "and") {
    c.pos++;
    f = { kind: "and", left: f, right: parseNegation(c) };
  }
  return f;
}

/** negation ::= NOT negation | primary */
function parseNegation(c: Cursor): Formula {
  if (peek(c)?.kind === "not") {
    c.pos++;
    return { kind: "not", arg: parseNegation(c) };
  }
  return parsePrimary(c);
}

/** primary ::= "(" formula ")" | atom
 * The operand extends to the next depth-0 binary connective (or an
 * unmatched close, or the end). A wholly-wrapped ( … ) is logical
 * grouping; any other parenthesis belongs to the JavaScript island. */
function parsePrimary(c: Cursor): Formula {
  const start = c.pos;
  let depth = 0;
  while (c.pos < c.end) {
    const t = c.toks[c.pos]!;
    if (t.kind === "open") depth++;
    else if (t.kind === "close") {
      if (depth === 0) break;
      depth--;
    } else if (depth === 0 && BINARY.has(t.kind)) break;
    c.pos++;
  }
  const span = c.toks.slice(start, c.pos);
  if (span.length === 0) {
    throw new PabstError("empty operand: a connective is missing a side");
  }
  if (whollyWrapped(span)) {
    return parseFormula(c.toks, start + 1, c.pos - 1, c.src);
  }
  const text = sliceText(c.src, span).trim();
  return { kind: "atom", text, js: desugarEquations(text) };
}

function peek(c: Cursor): FToken | undefined {
  return c.pos < c.end ? c.toks[c.pos] : undefined;
}

/** True when span[0] is "(" whose match is the final token. */
function whollyWrapped(span: FToken[]): boolean {
  if (span.length < 2 || span[0]!.kind !== "open" || span[0]!.text !== "(") {
    return false;
  }
  let depth = 0;
  for (let i = 0; i < span.length; i++) {
    const t = span[i]!;
    if (t.kind === "open") depth++;
    else if (t.kind === "close") {
      depth--;
      if (depth === 0) return i === span.length - 1;
    }
  }
  return false;
}
