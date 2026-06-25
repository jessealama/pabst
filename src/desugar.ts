export interface Desugared {
  preconditions: string[];
  body: string;
}

/** Split `s` at depth-0 implication arrows (==>, ->, →). Returns trimmed segments. */
function splitTopArrows(s: string): string[] {
  const segs: string[] = [];
  let depth = 0;
  let start = 0;
  let str: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (str) {
      if (c === "\\") { i++; continue; }
      if (c === str) str = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") { str = c; continue; }
    if (c === "(" || c === "[" || c === "{") { depth++; continue; }
    if (c === ")" || c === "]" || c === "}") { depth--; continue; }
    if (depth !== 0) continue;
    if (s.startsWith("==>", i)) { segs.push(s.slice(start, i).trim()); i += 2; start = i + 1; continue; }
    if (s.startsWith("->", i)) { segs.push(s.slice(start, i).trim()); i += 1; start = i + 1; continue; }
    if (c === "→") { segs.push(s.slice(start, i).trim()); start = i + 1; continue; }
  }
  segs.push(s.slice(start).trim());
  return segs;
}

/** Index of the `)` matching the `(` at `open`. */
function matchParen(s: string, open: number): number {
  let depth = 0;
  let str: string | null = null;
  for (let i = open; i < s.length; i++) {
    const c = s[i]!;
    if (str) { if (c === "\\") { i++; continue; } if (c === str) str = null; continue; }
    if (c === "'" || c === '"' || c === "`") { str = c; continue; }
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return i; }
  }
  throw new Error(`unbalanced parentheses in property body: ${s}`);
}

/** Desugar arrows that appear inside parentheses; pass everything else through. */
function desugarNested(s: string): string {
  let out = "";
  let i = 0;
  let str: string | null = null;
  while (i < s.length) {
    const c = s[i]!;
    if (str) {
      out += c;
      if (c === "\\" && i + 1 < s.length) { out += s[i + 1]!; i += 2; continue; }
      if (c === str) str = null;
      i++; continue;
    }
    if (c === "'" || c === '"' || c === "`") { str = c; out += c; i++; continue; }
    if (c === "(") {
      const close = matchParen(s, i);
      out += "(" + desugarExpr(s.slice(i + 1, close)) + ")";
      i = close + 1; continue;
    }
    out += c; i++;
  }
  return out;
}

/** Fully desugar an expression: arrows at this level → !(P)||(Q), then recurse into parens. */
function desugarExpr(s: string): string {
  return foldImplication(splitTopArrows(s));
}

function foldImplication(segs: string[]): string {
  if (segs.length === 1) return desugarNested(segs[0]!);
  return `!(${desugarNested(segs[0]!)}) || (${foldImplication(segs.slice(1))})`;
}

export function desugar(body: string): Desugared {
  const segs = splitTopArrows(body);
  if (segs.length === 1) {
    return { preconditions: [], body: desugarNested(segs[0]!) };
  }
  return {
    preconditions: segs.slice(0, -1).map(desugarNested),
    body: desugarNested(segs[segs.length - 1]!),
  };
}
