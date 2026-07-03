import { extract, type RawAnnotation } from "./extract.js";
import { parsePrefix } from "./prefix-parser.js";
import { parseBody } from "./formula-parser.js";
import { lowerTop } from "./lower.js";
import { collectAtoms } from "./formula-ast.js";
import { freeIdentifiers, classify } from "./free-idents.js";
import { PabstError } from "./errors.js";
import type { PropertySpec } from "./ir.js";

export function buildSpecs(file: string): PropertySpec[] {
  const { exports, annotations } = extract(file);
  const specs: PropertySpec[] = [];
  for (const a of annotations) {
    try {
      specs.push(buildSpec(a, exports, file));
    } catch (e) {
      if (e instanceof PabstError) {
        throw new PabstError(
          `${file}:${a.line}: @ensures{${a.propertyName}}: ${e.message}`,
          { cause: e },
        );
      }
      throw e;
    }
  }
  return specs;
}

function buildSpec(
  a: RawAnnotation,
  exports: Set<string>,
  file: string,
): PropertySpec {
  const { binders, body } = parsePrefix(a.formula);
  const ast = parseBody(body);
  const { preconditions, body: loweredBody } = lowerTop(ast);
  const boundVars = new Set(binders.map((b) => b.varName));
  const idents = new Set<string>();
  for (const atom of collectAtoms(ast)) {
    for (const id of freeIdentifiers(atom)) idents.add(id);
  }
  const { freeExports } = classify(idents, boundVars, exports);
  return {
    name: a.propertyName,
    functionName: a.functionName,
    className: a.className,
    isStatic: a.isStatic,
    binders,
    body: loweredBody,
    preconditions,
    freeExports,
    location: { file, line: a.line },
  };
}
