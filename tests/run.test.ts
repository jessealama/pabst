import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { runTests, RESULTS_FILE } from "../src/run.js";
import type { RunMeta } from "../src/envelope.js";
import { ISSUE_SENTINEL, type Issue } from "../src/issue.js";

const repoRoot = process.cwd();

// Envelope meta is echoed through verbatim; these values just need to be
// recognizable in the output.
const META: RunMeta = {
  version: "0.0.0-test",
  startedAt: "2026-07-03T00:00:00.000Z",
  cwd: "/repo",
  seed: 42,
  generated: 1,
};

const ISSUE: Issue = {
  file: "a.ts",
  function: "f",
  property: "p",
  kind: "falsified",
  counterexample: { x: 1 },
};

// The spawned vitest resolves its binary by walking up node_modules from cwd,
// so these projects live inside the repo tree (gitignored under .pabst/), not
// os.tmpdir(). The spawned vitest also inherits the nearest config walking up
// from cwd, so each fixture pins its own: `ok` an empty one (restoring
// vitest's default include, which picks up *.spec.ts), `broken` the same
// empty one, `crash` a throwing one. Fixture tests are *.spec.ts so the OUTER
// suite's include (tests/**/*.test.ts, .pabst/**/*.test.ts) never collects a
// leftover copy from a crashed run.
const workDir = path.join(repoRoot, ".pabst", "runtest");
const okDir = path.join(workDir, "ok");
const crashDir = path.join(workDir, "crash");
const brokenDir = path.join(workDir, "broken");

const SAMPLE_SPEC = `import { it, expect } from "vitest";
it("passes", () => { expect(1).toBe(1); });
it("fails", () => {
  throw new Error(${JSON.stringify(ISSUE_SENTINEL + JSON.stringify(ISSUE))});
});
`;

function inDir<T>(dir: string, fn: () => T): T {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(prev);
  }
}

describe("runTests", () => {
  beforeAll(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.mkdirSync(okDir, { recursive: true });
    fs.mkdirSync(crashDir, { recursive: true });
    fs.writeFileSync(path.join(okDir, "sample.spec.ts"), SAMPLE_SPEC, "utf8");
    fs.writeFileSync(
      path.join(okDir, "vitest.config.ts"),
      `import { defineConfig } from "vitest/config";\nexport default defineConfig({});\n`,
      "utf8",
    );
    // A config that throws makes vitest die before its reporter writes the
    // results file — the observed real-world shape of the no-results path.
    fs.writeFileSync(
      path.join(crashDir, "vitest.config.ts"),
      `throw new Error("boom: config exploded");\n`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(crashDir, "sample.spec.ts"),
      SAMPLE_SPEC,
      "utf8",
    );
    // A spec that throws at import time: vitest survives to write results,
    // but with success:false and zero counted test failures.
    fs.mkdirSync(brokenDir, { recursive: true });
    fs.writeFileSync(
      path.join(brokenDir, "vitest.config.ts"),
      `import { defineConfig } from "vitest/config";\nexport default defineConfig({});\n`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(brokenDir, "sample.spec.ts"),
      `throw new Error("boom: import exploded");\n`,
      "utf8",
    );
  });
  afterAll(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
  });

  it(
    "assembles an envelope from a run, collecting tagged failures",
    { timeout: 60000 },
    () => {
      const result = inDir(okDir, () => runTests(".", META));
      expect(result.kind).toBe("completed");
      if (result.kind !== "completed") return;
      expect(result.envelope).toEqual({
        ...META,
        passed: 1,
        failed: 1,
        issues: [ISSUE],
      });
    },
  );

  it(
    "reports a broken run when a test file fails to load",
    { timeout: 60000 },
    () => {
      const result = inDir(brokenDir, () => runTests(".", META));
      expect(result.kind).toBe("broken-run");
      if (result.kind !== "broken-run") return;
      expect(result.status).not.toBe(0);
      expect(result.messages.join("\n")).toContain("boom: import exploded");
    },
  );

  it(
    "reports no-results when vitest dies before writing results, ignoring a stale results file",
    { timeout: 60000 },
    () => {
      const result = inDir(crashDir, () => {
        // A stale results file from an earlier run must not be mistaken for
        // this run's output.
        fs.mkdirSync(path.dirname(RESULTS_FILE), { recursive: true });
        fs.writeFileSync(
          RESULTS_FILE,
          JSON.stringify({
            numPassedTests: 9,
            numFailedTests: 0,
            success: true,
            testResults: [],
          }),
          "utf8",
        );
        return runTests(".", META);
      });
      expect(result.kind).toBe("no-results");
      if (result.kind !== "no-results") return;
      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain("boom: config exploded");
    },
  );
});
