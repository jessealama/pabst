import { parseArgs } from "node:util";
import { globSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { generate } from "./codegen.js";
import { buildEnvelope } from "./envelope.js";
import { randomSeed, parseSeed } from "./seed.js";

const RESULTS_FILE = ".pabst/.last-run.json";

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

  let seed: number;
  try {
    seed = values.seed !== undefined ? parseSeed(values.seed) : randomSeed();
  } catch (e) {
    console.error(`error: ${(e as Error).message}`);
    return 2;
  }

  const files = [...new Set(patterns.flatMap((p) => globSync(p)))].filter((f) => TS_EXT.test(f));
  if (files.length === 0) {
    console.error("error: no matching .ts files");
    return 2;
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

  // Capture vitest's machine-readable output instead of inheriting its full
  // reporter. We assemble our own JSON envelope from it.
  const res = spawnSync(
    "npx",
    ["vitest", "run", ".pabst", "--reporter=json", `--outputFile=${RESULTS_FILE}`],
    { encoding: "utf8" },
  );

  let json;
  try {
    json = JSON.parse(readFileSync(RESULTS_FILE, "utf8"));
  } catch {
    // No parseable results (e.g. the generated tests failed to compile). Surface
    // vitest's raw output on stderr so the underlying error isn't swallowed; emit
    // no envelope, because the run produced no trustworthy results.
    process.stderr.write(res.stdout ?? "");
    process.stderr.write(res.stderr ?? "");
    return res.status ?? 1;
  }

  const envelope = buildEnvelope({ version, startedAt, cwd, seed, generated }, json);
  console.log(JSON.stringify(envelope, null, 2));
  return envelope.failed > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
