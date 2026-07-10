import { existsSync, globSync } from "node:fs";
import * as path from "node:path";
import ts from "typescript";
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

// TS18003 ("No inputs were found in config file") is the config saying it
// names no files — that is "no answer here", not a broken config, so
// discovery falls through to the src/ convention. Every other diagnostic
// (bad JSON, unresolvable extends, ...) is user-facing and fatal: silently
// testing different files than the user's config describes would be worse
// than stopping.
const NO_INPUTS_ERROR = 18003;

function configError(diagnostic: ts.Diagnostic): PabstError {
  const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
  return new PabstError(`tsconfig.json: ${text}`);
}

/**
 * The files tsc would compile for ./tsconfig.json, as sorted relative paths
 * filtered to scannable sources; undefined when there is no tsconfig.json,
 * empty when the config resolves to no usable files.
 */
function tsconfigFiles(cwd: string): string[] | undefined {
  const configPath = path.join(cwd, "tsconfig.json");
  if (!existsSync(configPath)) return undefined;
  const read = ts.readConfigFile(configPath, ts.sys.readFile);
  if (read.error) throw configError(read.error);
  const parsed = ts.parseJsonConfigFileContent(
    read.config,
    ts.sys,
    cwd,
    undefined,
    configPath,
  );
  const fatal = parsed.errors.find((e) => e.code !== NO_INPUTS_ERROR);
  if (fatal) throw configError(fatal);
  return parsed.fileNames
    .map((f) => path.relative(cwd, f))
    .filter(isTsSource)
    .sort();
}

/**
 * Zero-argument mode: find the project's TypeScript sources. Uses the file
 * list of ./tsconfig.json when it names any, then the src/ convention;
 * throws PabstError when nothing is found.
 */
export function discoverFiles(): Discovery {
  const fromConfig = tsconfigFiles(process.cwd());
  if (fromConfig !== undefined && fromConfig.length > 0) {
    return { files: fromConfig, source: "tsconfig.json" };
  }
  if (existsSync("src")) {
    const files = globSync("src/**/*").filter(isTsSource).sort();
    if (files.length > 0) return { files, source: "src/" };
  }
  throw new PabstError(NO_SOURCES);
}
