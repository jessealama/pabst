import ts from "typescript";
import * as fs from "node:fs";
import { qualifiedName } from "./qualified-name.js";

export interface RawAnnotation {
  propertyName: string;
  functionName: string;
  className?: string;
  isStatic?: boolean;
  formula: string;
  line: number;
}

export interface ExtractResult {
  file: string;
  exports: Set<string>;
  annotations: RawAnnotation[];
}

// The `@ensures` tag name is matched via the JSDoc AST; this only peels the
// `{name}` prefix off the tag's comment text, leaving the formula as the rest.
const ENSURES_NAME = /^\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}([\s\S]*)$/;

interface EnsuresMatch {
  propertyName: string;
  formula: string;
  line: number;
}

/** Read a source file from disk and extract its annotations. */
export function extract(file: string): ExtractResult {
  return extractFromSource(fs.readFileSync(file, "utf8"), file);
}

/**
 * Extract `@ensures` annotations and exported names from already-loaded source
 * text. `file` is only a label — for diagnostics and the returned `file` field —
 * so this is pure and testable without touching disk.
 */
export function extractFromSource(text: string, file: string): ExtractResult {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const exportsSet = collectExports(sf);
  const annotations: RawAnnotation[] = [];
  const seen = new Map<string, Set<string>>();

  const record = (a: RawAnnotation, key: string, subject: string): void => {
    const set = seen.get(key) ?? new Set<string>();
    if (set.has(a.propertyName)) {
      throw new Error(`duplicate property name '${a.propertyName}' on ${subject} in ${file}`);
    }
    set.add(a.propertyName);
    seen.set(key, set);
    annotations.push(a);
  };

  for (const stmt of sf.statements) {
    if (ts.isClassDeclaration(stmt)) {
      collectClassAnnotations(stmt, sf, exportsSet, file, record);
      continue;
    }
    const fnName = functionNameOf(stmt);
    if (!fnName) continue;
    for (const m of ensuresComments(stmt, sf)) {
      record(
        { propertyName: m.propertyName, functionName: fnName, formula: m.formula, line: m.line },
        fnName,
        `function '${fnName}'`,
      );
    }
  }
  return { file, exports: exportsSet, annotations };
}

function ensuresComments(node: ts.Node, sf: ts.SourceFile): EnsuresMatch[] {
  const out: EnsuresMatch[] = [];
  for (const tag of ts.getJSDocTags(node)) {
    if (tag.tagName.escapedText !== "ensures") continue;
    const comment = ts.getTextOfJSDocComment(tag.comment)?.trim() ?? "";
    const m = ENSURES_NAME.exec(comment);
    if (!m) continue;
    out.push({
      propertyName: m[1]!,
      formula: m[2]!.trim(),
      line: sf.getLineAndCharacterOfPosition(tag.pos).line + 1,
    });
  }
  return out;
}

function collectClassAnnotations(
  cls: ts.ClassDeclaration,
  sf: ts.SourceFile,
  exportsSet: Set<string>,
  file: string,
  record: (a: RawAnnotation, key: string, subject: string) => void,
): void {
  const className = cls.name?.text;
  for (const member of cls.members) {
    const matches = ensuresComments(member, sf);
    if (matches.length === 0) continue;
    const label = memberLabel(member);
    if (!className) {
      throw new Error(`@ensures on method '${label}' of an anonymous class in ${file}`);
    }
    if (!isEligibleMethod(member)) {
      throw new Error(ineligibleMessage(member, label, className, file));
    }
    if (!exportsSet.has(className)) {
      throw new Error(
        `@ensures on method '${label}' of class '${className}', which is not exported from ${file}`,
      );
    }
    const isStatic = hasModifier(member, ts.SyntaxKind.StaticKeyword);
    const key = qualifiedName(label, className, isStatic);
    for (const m of matches) {
      record(
        { propertyName: m.propertyName, functionName: label, className, isStatic, formula: m.formula, line: m.line },
        key,
        `method '${key}'`,
      );
    }
  }
}

function isEligibleMethod(member: ts.ClassElement): member is ts.MethodDeclaration {
  if (!ts.isMethodDeclaration(member)) return false;
  if (!ts.isIdentifier(member.name)) return false; // computed name or #private
  if (hasModifier(member, ts.SyntaxKind.PrivateKeyword)) return false;
  if (hasModifier(member, ts.SyntaxKind.ProtectedKeyword)) return false;
  if (hasModifier(member, ts.SyntaxKind.AbstractKeyword)) return false;
  return true;
}

function ineligibleMessage(
  member: ts.ClassElement,
  label: string,
  className: string,
  file: string,
): string {
  const nonPublic =
    ts.isMethodDeclaration(member) &&
    (hasModifier(member, ts.SyntaxKind.PrivateKeyword) ||
      hasModifier(member, ts.SyntaxKind.ProtectedKeyword) ||
      ts.isPrivateIdentifier(member.name));
  if (nonPublic) {
    return `@ensures on non-public method '${label}' of class '${className}' in ${file}`;
  }
  return (
    `@ensures on unsupported member '${label}' of class '${className}' in ${file} ` +
    `(accessors, constructors, abstract, and computed-name members are not supported)`
  );
}

function memberLabel(member: ts.ClassElement): string {
  const name = member.name;
  if (name && (ts.isIdentifier(name) || ts.isPrivateIdentifier(name) || ts.isStringLiteral(name))) {
    return name.text;
  }
  if (ts.isConstructorDeclaration(member)) return "constructor";
  return "<computed>";
}

function hasModifier(node: ts.Node, kind: ts.SyntaxKind): boolean {
  const mods = ts.canHaveModifiers(node) ? ts.getModifiers(node) : undefined;
  return mods?.some((m) => m.kind === kind) ?? false;
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
