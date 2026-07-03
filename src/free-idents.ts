import ts from "typescript";
import { PabstError } from "./errors.js";

export const GLOBALS = new Set<string>([
  "Math",
  "Number",
  "JSON",
  "Object",
  "Array",
  "String",
  "Boolean",
  "BigInt",
  "Date",
  "isNaN",
  "isFinite",
  "parseInt",
  "parseFloat",
  "undefined",
  "NaN",
  "Infinity",
  "Symbol",
  "Map",
  "Set",
  "RegExp",
  "Error",
  "console",
]);

export function freeIdentifiers(expr: string): Set<string> {
  const sf = ts.createSourceFile(
    "__expr.ts",
    `(${expr});`,
    ts.ScriptTarget.Latest,
    true,
  );
  const found = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isIdentifier(node)) {
      const p = node.parent;
      const isPropName = ts.isPropertyAccessExpression(p) && p.name === node;
      const isQualified = ts.isQualifiedName(p) && p.right === node;
      const isObjKey = ts.isPropertyAssignment(p) && p.name === node;
      if (!isPropName && !isQualified && !isObjKey) found.add(node.text);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

export interface Classification {
  freeExports: string[];
}

export function classify(
  idents: Set<string>,
  boundVars: Set<string>,
  moduleExports: Set<string>,
): Classification {
  const freeExports: string[] = [];
  for (const id of idents) {
    if (boundVars.has(id)) continue;
    if (GLOBALS.has(id)) continue;
    if (moduleExports.has(id)) {
      freeExports.push(id);
      continue;
    }
    // The per-annotation wrapper in build-spec prefixes file, line, and
    // property name, so naming them here would state them twice.
    throw new PabstError(`references '${id}', which is not exported`);
  }
  return { freeExports: [...new Set(freeExports)] };
}
