import ts from "typescript";

export const GLOBALS = new Set<string>([
  "Math", "Number", "JSON", "Object", "Array", "String", "Boolean", "BigInt",
  "Date", "isNaN", "isFinite", "parseInt", "parseFloat", "undefined", "NaN",
  "Infinity", "Symbol", "Map", "Set", "RegExp", "Error", "console",
]);

/** pabst-provided builtins available to property bodies (never module exports). */
export const BUILTINS = new Set<string>(["implies"]);

/** Collect free identifiers from an already-parsed expression node. */
export function freeIdentifiers(node: ts.Node): Set<string> {
  const found = new Set<string>();
  const visit = (n: ts.Node): void => {
    if (ts.isIdentifier(n)) {
      const p = n.parent;
      const isPropName = ts.isPropertyAccessExpression(p) && p.name === n;
      const isQualified = ts.isQualifiedName(p) && p.right === n;
      const isObjKey = ts.isPropertyAssignment(p) && p.name === n;
      if (!isPropName && !isQualified && !isObjKey) found.add(n.text);
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return found;
}

export interface Classification {
  freeExports: string[];
}

export function classify(
  idents: Set<string>,
  boundVars: Set<string>,
  moduleExports: Set<string>,
  propertyName: string,
  moduleFile: string,
): Classification {
  const freeExports: string[] = [];
  for (const id of idents) {
    if (boundVars.has(id)) continue;
    if (GLOBALS.has(id)) continue;
    if (BUILTINS.has(id)) continue;
    if (moduleExports.has(id)) { freeExports.push(id); continue; }
    throw new Error(`property '${propertyName}' references '${id}', which is not exported from ${moduleFile}`);
  }
  return { freeExports: [...new Set(freeExports)] };
}
