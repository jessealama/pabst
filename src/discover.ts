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
  source: "arguments" | "tsconfig.json" | "src/";
}

/**
 * The files pabst should scan: matches of the given patterns or, with no
 * patterns, zero-argument discovery (the tsconfig.json file list, then the
 * src/ convention). Throws PabstError when nothing usable is found.
 */
export function resolveFiles(patterns: string[]): Discovery {
  if (patterns.length > 0) {
    return { files: globbedFiles(patterns), source: "arguments" };
  }
  return discoverFiles();
}

// A pattern that itself names declaration files (index.d.ts, types/**/*.d.ts)
// is an explicit ask for them and is honored; any other pattern drops
// declaration matches (see isTsSource) so build output sitting next to its
// sources is not scanned twice.
function globbedFiles(patterns: string[]): string[] {
  const files = [
    ...new Set(
      patterns.flatMap((p) =>
        DECL_EXT.test(p) ? globSync(p) : globSync(p).filter(isTsSource),
      ),
    ),
  ];
  if (files.length === 0) throw new PabstError("no matching .ts files");
  return files;
}

const NO_SOURCES =
  'cannot determine where your source code is; pass files or globs (e.g. pabst test "src/**/*.ts")';

// TS18003 ("No inputs were found in config file") and TS18002 ("The 'files'
// list in config file is empty") are the config saying it names no files —
// that is "no answer here", not a broken config, so discovery falls through
// to the src/ convention.
const NO_INPUTS_ERRORS = new Set([18002, 18003]);

// Diagnostics about compilerOptions — unknown option (5023), unknown option
// with a suggestion (5025), wrong value type (5024), value outside the known
// set (6046) — cannot change which files the config enumerates, and routinely
// arise from version skew between the user's TypeScript and the one pabst
// bundles (a flag or target newer than ours). The file list is still exactly
// what tsc would compile, so these are ignored.
const OPTION_ERRORS = new Set([5023, 5024, 5025, 6046]);

// Every other diagnostic (bad JSON, unresolvable extends, misspelled root
// options like "excludes", ...) can make the file list differ from what the
// user's config describes, so it is user-facing and fatal: silently testing
// different files than the config means would be worse than stopping.
function fatalError(diagnostics: ts.Diagnostic[]): ts.Diagnostic | undefined {
  return diagnostics.find(
    (e) => !NO_INPUTS_ERRORS.has(e.code) && !OPTION_ERRORS.has(e.code),
  );
}

function configError(diagnostic: ts.Diagnostic): PabstError {
  const text = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
  return new PabstError(`tsconfig.json: ${text}`);
}

// path.relative yields ".."-led (or, across Windows drives, absolute) paths
// for files outside cwd. Generated tests are rooted in ./.pabst/, so a source
// outside the package cannot be tested from here — a monorepo neighbor's
// files are that neighbor's run, not this one's — and is dropped.
function insideCwd(rel: string): boolean {
  return (
    rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel)
  );
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
  const fatal = fatalError(parsed.errors);
  if (fatal) throw configError(fatal);
  const files = parsed.fileNames
    .map((f) => path.relative(cwd, f))
    .filter(insideCwd)
    .filter(isTsSource)
    .sort();
  // A "files" list names paths without checking them, so a stale entry comes
  // back with no diagnostic; stop with a real message rather than crashing on
  // the eventual read. (include-glob matches exist by construction.)
  const missing = files.find((f) => !existsSync(path.resolve(cwd, f)));
  if (missing) {
    throw new PabstError(`tsconfig.json: file not found: ${missing}`);
  }
  return files;
}

/**
 * Zero-argument mode: find the project's TypeScript sources. Uses the file
 * list of ./tsconfig.json when it names any, then the src/ convention;
 * throws PabstError when nothing is found.
 */
function discoverFiles(): Discovery {
  const fromConfig = tsconfigFiles(process.cwd());
  if (fromConfig !== undefined && fromConfig.length > 0) {
    return { files: fromConfig, source: "tsconfig.json" };
  }
  const files = globSync("src/**/*").filter(isTsSource).sort();
  if (files.length > 0) return { files, source: "src/" };
  throw new PabstError(NO_SOURCES);
}
