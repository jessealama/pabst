import { spawnSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { buildEnvelope, type FileResult, type RunMeta } from "./envelope.js";
import type { Envelope } from "./issue.js";

/** Where the spawned vitest writes its JSON results, relative to cwd. */
export const RESULTS_FILE = ".pabst/.last-run.json";

export type RunResult =
  | { kind: "completed"; envelope: Envelope }
  | { kind: "no-results"; status: number; stdout: string; stderr: string }
  | { kind: "broken-run"; status: number; messages: string[] };

/**
 * Run vitest over `target` (the generated-test root, or a single generated
 * file) and assemble the run envelope from its JSON results. When vitest
 * produces no parseable results file (e.g. it died on startup before its
 * reporter ran), the run yielded nothing trustworthy to report: instead of an
 * envelope, return vitest's raw output and exit status so the caller can
 * surface the underlying error.
 */
export function runTests(target: string, meta: RunMeta): RunResult {
  // A stale results file from a previous run must not be mistaken for this
  // run's output when vitest dies before writing one.
  rmSync(RESULTS_FILE, { force: true });
  const res = spawnSync(
    "npx",
    [
      "vitest",
      "run",
      target,
      "--reporter=json",
      `--outputFile=${RESULTS_FILE}`,
    ],
    { encoding: "utf8" },
  );
  let json;
  try {
    json = JSON.parse(readFileSync(RESULTS_FILE, "utf8"));
  } catch {
    return {
      kind: "no-results",
      status: res.status ?? 1,
      stdout: res.stdout ?? "",
      stderr: res.stderr ?? "",
    };
  }
  // An unhealthy run vitest couldn't attribute to any test (e.g. a test file
  // that failed to load) must not be reported as a trustworthy envelope. The
  // json reporter keeps the underlying errors in each file's `message`, not
  // on stdout/stderr.
  if (json.success === false && json.numFailedTests === 0) {
    const messages = ((json.testResults ?? []) as FileResult[]).flatMap((f) =>
      f.status === "failed" && f.message ? [f.message] : [],
    );
    return { kind: "broken-run", status: res.status || 1, messages };
  }
  return { kind: "completed", envelope: buildEnvelope(meta, json) };
}
