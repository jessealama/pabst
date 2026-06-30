import { extract } from "./extract.js";
import { parsePrefix } from "./prefix-parser.js";
import { parseBody } from "./formula-parser.js";
import { lowerTop } from "./lower.js";
import { collectAtoms } from "./formula-ast.js";
import { freeIdentifiers, classify } from "./free-idents.js";
import type { PropertySpec } from "./ir.js";

export function buildSpecs(file: string): PropertySpec[] {
  const { exports, annotations } = extract(file);
  const specs: PropertySpec[] = [];
  for (const a of annotations) {
    const { binders, body } = parsePrefix(a.formula);
    const ast = parseBody(body);
    const { preconditions, body: loweredBody } = lowerTop(ast);
    const boundVars = new Set(binders.map((b) => b.varName));
    const idents = new Set<string>();
    for (const atom of collectAtoms(ast)) {
      for (const id of freeIdentifiers(atom)) idents.add(id);
    }
    const { freeExports } = classify(idents, boundVars, exports, a.propertyName, file);
    specs.push({
      name: a.propertyName,
      functionName: a.functionName,
      className: a.className,
      isStatic: a.isStatic,
      binders,
      body: loweredBody,
      preconditions,
      freeExports,
      location: { file, line: a.line },
    });
  }
  return specs;
}
