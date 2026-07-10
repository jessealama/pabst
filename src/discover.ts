import { existsSync, globSync } from "node:fs";
import { PabstError } from "./errors.js";

const TS_EXT = /\.(ts|tsx|mts|cts)$/;
const DECL_EXT = /\.d\.(ts|mts|cts)$/;

/**
 * True for TypeScript source files pabst should scan: .ts/.tsx/.mts/.cts,
 * excluding declaration files — tsc copies JSDoc into declarations, so
 * scanning them alongside their sources extracts every property twice.
 */
export function isTsSource(file: string): boolean {
  return TS_EXT.test(file) && !DECL_EXT.test(file);
}

export interface Discovery {
  files: string[];
  source: "tsconfig.json" | "src/";
}

const NO_SOURCES =
  'cannot determine where your source code is; pass files or globs (e.g. pabst test "src/**/*.ts")';

/**
 * Zero-argument mode: find the project's TypeScript sources. Tries the src/
 * convention; throws PabstError when nothing is found. (Task 3 puts the
 * tsconfig.json branch in front of the src/ check.)
 */
export function discoverFiles(): Discovery {
  if (existsSync("src")) {
    const files = globSync("src/**/*").filter(isTsSource).sort();
    if (files.length > 0) return { files, source: "src/" };
  }
  throw new PabstError(NO_SOURCES);
}
