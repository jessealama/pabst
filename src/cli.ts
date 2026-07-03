import { parseArgs } from "node:util";
import { globSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { generate } from "./codegen.js";
import { PabstError } from "./errors.js";
import { runTests } from "./run.js";
import { randomSeed, parseSeed } from "./seed.js";

const TS_EXT = /\.(ts|tsx|mts|cts)$/;

function readVersion(): string {
  const url = new URL("../package.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")).version as string;
}

export function main(argv: string[] = process.argv.slice(2)): number {
  const { positionals, values } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: { seed: { type: "string" } },
  });
  const command = positionals[0];
  const patterns = positionals.slice(1);

  if (command !== "test" && command !== "gen") {
    console.error("usage: pabst <test|gen> [--seed <n>] <files-or-globs...>");
    return 2;
  }
  if (patterns.length === 0) {
    console.error("error: no files or globs provided");
    return 2;
  }

  // Same policy as compilation below: user-facing errors (PabstError) map to
  // the documented exit-2 error mode; anything else is an internal bug and
  // crashes loudly.
  let seed: number;
  try {
    seed = values.seed !== undefined ? parseSeed(values.seed) : randomSeed();
  } catch (e) {
    if (e instanceof PabstError) {
      console.error(`error: ${e.message}`);
      return 2;
    }
    throw e;
  }

  const files = [...new Set(patterns.flatMap((p) => globSync(p)))].filter((f) =>
    TS_EXT.test(f),
  );
  if (files.length === 0) {
    console.error("error: no matching .ts files");
    return 2;
  }

  const startedAt = new Date().toISOString();
  const cwd = process.cwd();
  const version = readVersion();

  // User-facing compile errors (PabstError) map to the documented exit-2
  // error mode; anything else is an internal bug and crashes loudly.
  let results;
  try {
    results = generate(files, ".pabst", seed);
  } catch (e) {
    if (e instanceof PabstError) {
      console.error(`error: ${e.message}`);
      return 2;
    }
    throw e;
  }
  const generated = results.reduce((n, r) => n + r.propertyCount, 0);
  console.error(
    `pabst: generated ${generated} propert${generated === 1 ? "y" : "ies"} across ${results.length} file(s) into .pabst/`,
  );

  if (command === "gen") return 0;

  // Capture vitest's machine-readable output instead of inheriting its full
  // reporter; runTests assembles our own JSON envelope from it.
  const result = runTests(".pabst", {
    version,
    startedAt,
    cwd,
    seed,
    generated,
  });

  if (result.kind === "no-results") {
    // No parseable results (e.g. vitest died on startup). Surface vitest's raw
    // output on stderr so the underlying error isn't swallowed; emit no
    // envelope, because the run produced no trustworthy results.
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    return result.status;
  }

  console.log(JSON.stringify(result.envelope, null, 2));
  return result.envelope.failed > 0 ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  process.exit(main());
}
