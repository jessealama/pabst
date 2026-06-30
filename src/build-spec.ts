import { extract } from "./extract.js";
import { parseFormula } from "./parse-formula.js";
import { freeIdentifiers, classify } from "./free-idents.js";
import type { PropertySpec } from "./ir.js";

export function buildSpecs(file: string): PropertySpec[] {
  const { exports, annotations } = extract(file);
  const specs: PropertySpec[] = [];
  for (const a of annotations) {
    const { binders, preconditions, body, exprNodes } = parseFormula(a.formula);
    const boundVars = new Set(binders.map((b) => b.varName));
    const idents = new Set<string>();
    for (const node of exprNodes) {
      for (const id of freeIdentifiers(node)) idents.add(id);
    }
    const { freeExports } = classify(idents, boundVars, exports, a.propertyName, file);
    specs.push({
      name: a.propertyName,
      functionName: a.functionName,
      className: a.className,
      isStatic: a.isStatic,
      binders,
      body,
      preconditions,
      freeExports,
      location: { file, line: a.line },
    });
  }
  return specs;
}
