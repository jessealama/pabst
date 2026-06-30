import * as path from "node:path";
import { arbitraryFor } from "./domains.js";
import { qualifiedName } from "./qualified-name.js";
import type { PropertySpec } from "./ir.js";

const SRC_EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;

export function emit(specs: PropertySpec[], sourceFile: string, outFile: string, seed: number): string {
  const srcAbs = path.resolve(sourceFile).replace(SRC_EXT, "");
  const outDir = path.dirname(path.resolve(outFile));
  let rel = path.relative(outDir, srcAbs).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;

  const allExports = [...new Set(specs.flatMap((s) => s.freeExports))].sort();

  const lines: string[] = [];
  lines.push(`import { describe } from "vitest";`);
  lines.push(`import { test, fc } from "@fast-check/vitest";`);
  lines.push(`import { report as __pabstReport, implies } from "pabst/runtime";`);
  lines.push(`import * as __M from "${rel}";`);
  if (allExports.length > 0) lines.push(`const { ${allExports.join(", ")} } = __M;`);
  lines.push("");
  lines.push(`describe("pabst", () => {`);

  // Group by class (undefined = top-level function), then by member name.
  const byClass = new Map<string | undefined, Map<string, PropertySpec[]>>();
  for (const s of specs) {
    let methods = byClass.get(s.className);
    if (!methods) {
      methods = new Map<string, PropertySpec[]>();
      byClass.set(s.className, methods);
    }
    const arr = methods.get(s.functionName) ?? [];
    arr.push(s);
    methods.set(s.functionName, arr);
  }

  for (const [className, methods] of byClass) {
    if (className === undefined) {
      for (const [fnName, fnSpecs] of methods) {
        lines.push(`  describe(${JSON.stringify(fnName)}, () => {`);
        for (const s of fnSpecs) lines.push(emitProp(s, sourceFile, seed, "    "));
        lines.push(`  });`);
      }
    } else {
      lines.push(`  describe(${JSON.stringify(className)}, () => {`);
      for (const [methodName, mSpecs] of methods) {
        lines.push(`    describe(${JSON.stringify(methodName)}, () => {`);
        for (const s of mSpecs) lines.push(emitProp(s, sourceFile, seed, "      "));
        lines.push(`    });`);
      }
      lines.push(`  });`);
    }
  }

  lines.push(`});`);
  lines.push("");
  return lines.join("\n");
}

function emitProp(s: PropertySpec, sourceFile: string, seed: number, indent: string): string {
  const arbs = s.binders.map((b) => arbitraryFor(b.domain)).join(", ");
  const vars = s.binders.map((b) => b.varName).join(", ");
  const varNames = s.binders.map((b) => JSON.stringify(b.varName)).join(", ");
  const name = JSON.stringify(s.name);
  const file = JSON.stringify(sourceFile);
  const fn = JSON.stringify(qualifiedName(s.functionName, s.className, s.isStatic));
  const errMsg = JSON.stringify(`property '${s.name}' did not evaluate to a boolean`);
  const reporter = `(d) => __pabstReport(${file}, ${fn}, ${name}, [${varNames}], d)`;
  const params = `{ seed: ${seed}, reporter: ${reporter} }`;
  const out: string[] = [];
  out.push(`${indent}test.prop([${arbs}], ${params})(${name}, (${vars}) => {`);
  for (const p of s.preconditions) out.push(`${indent}  fc.pre(${p});`);
  out.push(`${indent}  const __r = (${s.body});`);
  out.push(`${indent}  if (typeof __r !== "boolean") throw new Error(${errMsg});`);
  out.push(`${indent}  return __r;`);
  out.push(`${indent}});`);
  return out.join("\n");
}
