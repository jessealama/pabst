import * as fs from "node:fs";
import * as path from "node:path";
import { buildSpecs } from "./build-spec.js";
import { emit } from "./emit.js";

const SRC_EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;

export interface GenResult {
  sourceFile: string;
  outFile: string;
  propertyCount: number;
}

export function generate(files: string[], outRoot = ".pabst"): GenResult[] {
  const results: GenResult[] = [];
  for (const file of files) {
    const specs = buildSpecs(file);
    if (specs.length === 0) continue;
    const rel = path.relative(process.cwd(), path.resolve(file));
    const noExt = rel.replace(SRC_EXT, "");
    const outFile = path.join(outRoot, noExt + ".pabst.test.ts");
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, emit(specs, file, outFile), "utf8");
    results.push({ sourceFile: file, outFile, propertyCount: specs.length });
  }
  return results;
}
