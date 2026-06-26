import ts from "typescript";
import * as fs from "node:fs";

export interface RawAnnotation {
  propertyName: string;
  functionName: string;
  formula: string;
  line: number;
}

export interface ExtractResult {
  file: string;
  exports: Set<string>;
  annotations: RawAnnotation[];
}

const ENSURES = /@ensures\s*\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}([\s\S]*)/;

export function extract(file: string): ExtractResult {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const exportsSet = collectExports(sf);
  const annotations: RawAnnotation[] = [];
  const seen = new Map<string, Set<string>>();

  for (const stmt of sf.statements) {
    const fnName = functionNameOf(stmt);
    if (!fnName) continue;
    const ranges = ts.getLeadingCommentRanges(text, stmt.getFullStart()) ?? [];
    for (const r of ranges) {
      if (r.kind !== ts.SyntaxKind.MultiLineCommentTrivia) continue;
      const clean = stripJsdoc(text.slice(r.pos, r.end));
      const m = ENSURES.exec(clean);
      if (!m) continue;
      const propertyName = m[1]!;
      const formula = m[2]!.trim();
      const line = sf.getLineAndCharacterOfPosition(r.pos).line + 1;
      const set = seen.get(fnName) ?? new Set<string>();
      if (set.has(propertyName)) {
        throw new Error(`duplicate property name '${propertyName}' on function '${fnName}' in ${file}`);
      }
      set.add(propertyName);
      seen.set(fnName, set);
      annotations.push({ propertyName, functionName: fnName, formula, line });
    }
  }
  return { file, exports: exportsSet, annotations };
}

function functionNameOf(stmt: ts.Statement): string | undefined {
  if (ts.isFunctionDeclaration(stmt) && stmt.name) return stmt.name.text;
  if (ts.isVariableStatement(stmt)) {
    const decl = stmt.declarationList.declarations[0];
    if (
      decl && ts.isIdentifier(decl.name) && decl.initializer &&
      (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
    ) {
      return decl.name.text;
    }
  }
  return undefined;
}

function collectExports(sf: ts.SourceFile): Set<string> {
  const out = new Set<string>();
  for (const stmt of sf.statements) {
    const mods = ts.canHaveModifiers(stmt) ? ts.getModifiers(stmt) : undefined;
    const isExported = mods?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
    if (isExported) {
      if (ts.isFunctionDeclaration(stmt) && stmt.name) out.add(stmt.name.text);
      else if (ts.isClassDeclaration(stmt) && stmt.name) out.add(stmt.name.text);
      else if (ts.isVariableStatement(stmt)) {
        for (const d of stmt.declarationList.declarations) {
          if (ts.isIdentifier(d.name)) out.add(d.name.text);
        }
      }
    }
    if (ts.isExportDeclaration(stmt) && stmt.exportClause && ts.isNamedExports(stmt.exportClause)) {
      for (const e of stmt.exportClause.elements) out.add(e.name.text);
    }
  }
  return out;
}

function stripJsdoc(raw: string): string {
  let s = raw;
  if (s.startsWith("/*")) s = s.slice(2);
  if (s.endsWith("*/")) s = s.slice(0, -2);
  return s.split("\n").map((line) => line.replace(/^\s*\*?\s?/, "")).join("\n").trim();
}
