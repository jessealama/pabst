import { extract } from "./extract.js";
import { parsePrefix } from "./prefix-parser.js";
import { desugar } from "./desugar.js";
import { freeIdentifiers, classify } from "./free-idents.js";
import type { PropertySpec } from "./ir.js";

export function buildSpecs(file: string): PropertySpec[] {
  const { exports, annotations } = extract(file);
  const specs: PropertySpec[] = [];
  for (const a of annotations) {
    const { binders, body } = parsePrefix(a.formula);
    const { preconditions, body: desugaredBody } = desugar(body);
    const boundVars = new Set(binders.map((b) => b.varName));
    const idents = new Set<string>();
    for (const expr of [...preconditions, desugaredBody]) {
      for (const id of freeIdentifiers(expr)) idents.add(id);
    }
    const { freeExports } = classify(idents, boundVars, exports, a.propertyName, file);
    specs.push({
      name: a.propertyName,
      functionName: a.functionName,
      binders,
      body: desugaredBody,
      preconditions,
      freeExports,
      location: { file, line: a.line },
    });
  }
  return specs;
}
