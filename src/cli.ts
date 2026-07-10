#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { generate } from "./codegen.js";
import { resolveFiles } from "./discover.js";
import { PabstError } from "./errors.js";
import { runTests } from "./run.js";
import { randomSeed, parseSeed } from "./seed.js";

function readVersion(): string {
  const url = new URL("../package.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")).version as string;
}

const USAGE = "usage: pabst <test|gen> [--seed <n>] [files-or-globs...]";

const HELP = `${USAGE}

commands:
  test  generate property tests from @ensures annotations, run them, and
        print a JSON report to stdout
  gen   generate only; run your own vitest against .pabst/

when no files are given, pabst discovers your sources: the files that
tsconfig.json would compile or, failing that, src/**. declaration files
(.d.ts) are skipped unless a pattern names them (e.g. pabst gen index.d.ts).

options:
  --seed <n>  reproduce a prior run's generation (n is echoed in the report)
  -h, --help  show this help`;

export function main(argv: string[] = process.argv.slice(2)): number {
  // parseArgs throws on unknown options and the like — usage errors, which
  // map to the documented exit-2 mode; anything else crashes loudly.
  let positionals: string[];
  let values: { seed?: string; help?: boolean };
  try {
    ({ positionals, values } = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        seed: { type: "string" },
        help: { type: "boolean", short: "h" },
      },
    }));
  } catch (e) {
    if (
      e instanceof TypeError &&
      "code" in e &&
      typeof e.code === "string" &&
      e.code.startsWith("ERR_PARSE_ARGS_")
    ) {
      console.error(USAGE);
      return 2;
    }
    throw e;
  }
  if (values.help) {
    console.log(HELP);
    return 0;
  }
  const command = positionals[0];
  const patterns = positionals.slice(1);

  if (command !== "test" && command !== "gen") {
    console.error(USAGE);
    return 2;
  }
  // User-facing errors anywhere below — a bad --seed, file resolution coming
  // up empty, a malformed tsconfig, compile errors — are PabstErrors and map
  // to the documented exit-2 error mode; anything else is an internal bug
  // and crashes loudly.
  try {
    return run(command, patterns, values.seed);
  } catch (e) {
    if (e instanceof PabstError) {
      console.error(`error: ${e.message}`);
      return 2;
    }
    throw e;
  }
}

function run(
  command: "test" | "gen",
  patterns: string[],
  seedArg: string | undefined,
): number {
  const seed = seedArg !== undefined ? parseSeed(seedArg) : randomSeed();

  const { files, source } = resolveFiles(patterns);
  if (source !== "arguments") {
    console.error(
      `pabst: no files given; discovered ${files.length} file(s) via ${source}`,
    );
  }

  const startedAt = new Date().toISOString();
  const cwd = process.cwd();
  const version = readVersion();

  const results = generate(files, ".pabst", seed);
  const generated = results.reduce((n, r) => n + r.propertyCount, 0);
  console.error(
    `pabst: generated ${generated} propert${generated === 1 ? "y" : "ies"} across ${results.length} file(s) into .pabst/`,
  );

  if (command === "gen") return 0;

  const result = runTests(".pabst", {
    version,
    startedAt,
    cwd,
    seed,
    generated,
  });

  if (result.kind === "no-results") {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    return result.status;
  }
  if (result.kind === "broken-run") {
    for (const m of result.messages) console.error(`error: ${m}`);
    return result.status;
  }

  console.log(JSON.stringify(result.envelope, null, 2));
  return result.envelope.failed > 0 ? 1 : 0;
}

// npm installs the bin as a symlink (node_modules/.bin/pabst -> this file).
// Node resolves the main module to its realpath, but argv[1] keeps the
// symlink path, so argv[1] must be realpath'd before comparing.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href
) {
  process.exit(main());
}
