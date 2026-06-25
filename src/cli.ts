import { parseArgs } from "node:util";
import { globSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { generate } from "./codegen.js";

const TS_EXT = /\.(ts|tsx|mts|cts)$/;

export function main(argv: string[] = process.argv.slice(2)): number {
  const { positionals } = parseArgs({ args: argv, allowPositionals: true });
  const command = positionals[0];
  const patterns = positionals.slice(1);

  if (command !== "test" && command !== "gen") {
    console.error("usage: pabst <test|gen> <files-or-globs...>");
    return 2;
  }
  if (patterns.length === 0) {
    console.error("error: no files or globs provided");
    return 2;
  }

  const files = [...new Set(patterns.flatMap((p) => globSync(p)))].filter((f) => TS_EXT.test(f));
  if (files.length === 0) {
    console.error("error: no matching .ts files");
    return 2;
  }

  const results = generate(files);
  const total = results.reduce((n, r) => n + r.propertyCount, 0);
  console.error(`pabst: generated ${total} propert${total === 1 ? "y" : "ies"} across ${results.length} file(s) into .pabst/`);

  if (command === "gen") return 0;

  const res = spawnSync("npx", ["vitest", "run", ".pabst"], { stdio: "inherit" });
  return res.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main());
}
