import * as fs from "node:fs";
import * as path from "node:path";
import { buildSpecs } from "./build-spec.js";
import { emit } from "./emit.js";
import { PabstError } from "./errors.js";
import { randomSeed } from "./seed.js";

const SRC_EXT = /\.(ts|tsx|mts|cts|js|mjs|cjs)$/;

export interface GenResult {
  sourceFile: string;
  outFile: string;
  propertyCount: number;
}

export function generate(
  files: string[],
  outRoot = ".pabst",
  seed: number = randomSeed(),
): GenResult[] {
  const results: GenResult[] = [];
  for (const file of files) {
    const rel = path.relative(process.cwd(), path.resolve(file));
    // Out files mirror rel under outRoot, so a ".."-led (or, across Windows
    // drives, absolute) rel would place them outside it — where the runner
    // never looks. Refuse rather than silently skip what looks generated.
    if (
      rel === ".." ||
      rel.startsWith(`..${path.sep}`) ||
      path.isAbsolute(rel)
    ) {
      throw new PabstError(
        `${file} is outside the current directory; run pabst from the directory containing it`,
      );
    }
    const specs = buildSpecs(file);
    if (specs.length === 0) continue;
    const noExt = rel.replace(SRC_EXT, "");
    const outFile = path.join(outRoot, noExt + ".pabst.test.ts");
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, emit(specs, file, outFile, seed), "utf8");
    results.push({ sourceFile: file, outFile, propertyCount: specs.length });
  }
  return results;
}
