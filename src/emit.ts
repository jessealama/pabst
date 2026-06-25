import * as path from "node:path";
import { arbitraryFor } from "./domains.js";
import type { PropertySpec } from "./ir.js";

const SRC_EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;

export function emit(specs: PropertySpec[], sourceFile: string, outFile: string): string {
  const srcAbs = path.resolve(sourceFile).replace(SRC_EXT, "");
  const outDir = path.dirname(path.resolve(outFile));
  let rel = path.relative(outDir, srcAbs).split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;

  const allExports = [...new Set(specs.flatMap((s) => s.freeExports))].sort();

  const lines: string[] = [];
  lines.push(`import { describe } from "vitest";`);
  lines.push(`import { test, fc } from "@fast-check/vitest";`);
  lines.push(`import * as __M from "${rel}";`);
  if (allExports.length > 0) lines.push(`const { ${allExports.join(", ")} } = __M;`);
  lines.push("");
  lines.push(`describe("pabst", () => {`);

  const groups = new Map<string, PropertySpec[]>();
  for (const s of specs) {
    const arr = groups.get(s.functionName) ?? [];
    arr.push(s);
    groups.set(s.functionName, arr);
  }
  for (const [fnName, fnSpecs] of groups) {
    lines.push(`  describe(${JSON.stringify(fnName)}, () => {`);
    for (const s of fnSpecs) lines.push(emitProp(s));
    lines.push(`  });`);
  }
  lines.push(`});`);
  lines.push("");
  return lines.join("\n");
}

function emitProp(s: PropertySpec): string {
  const arbs = s.binders.map((b) => arbitraryFor(b.domain)).join(", ");
  const vars = s.binders.map((b) => b.varName).join(", ");
  const errMsg = JSON.stringify(`property '${s.name}' did not evaluate to a boolean`);
  const out: string[] = [];
  out.push(`    test.prop([${arbs}])(${JSON.stringify(s.name)}, (${vars}) => {`);
  for (const p of s.preconditions) out.push(`      fc.pre(${p});`);
  out.push(`      const __r = (${s.body});`);
  out.push(`      if (typeof __r !== "boolean") throw new Error(${errMsg});`);
  out.push(`      return __r;`);
  out.push(`    });`);
  return out.join("\n");
}
