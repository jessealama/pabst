import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { generate } from "../src/codegen.js";
import { parseIssue } from "../src/issue.js";

const root = process.cwd();
const passSrc = path.join(root, "tests/fixtures/e2e/pass.ts");
const failSrc = path.join(root, "tests/fixtures/e2e/fail.ts");
const genDir = path.join(root, ".pabst/tests/fixtures/e2e");

function clean(): void {
  fs.rmSync(genDir, { recursive: true, force: true });
}

function runVitest(file: string): { status: number; issues: ReturnType<typeof parseIssue>[] } {
  const out = path.join(root, ".pabst/.e2e-run.json");
  const res = spawnSync(
    "npx",
    ["vitest", "run", file, "--reporter=json", `--outputFile=${out}`],
    { encoding: "utf8" },
  );
  const json = JSON.parse(fs.readFileSync(out, "utf8"));
  const issues = [];
  for (const f of json.testResults ?? []) {
    for (const a of f.assertionResults ?? []) {
      if (a.status === "failed") issues.push(parseIssue(a.failureMessages[0] ?? ""));
    }
  }
  return { status: res.status ?? 1, issues };
}

describe("end-to-end", () => {
  beforeAll(clean);
  afterAll(clean);

  it("a true property passes vitest", { timeout: 30000 }, () => {
    const [r] = generate([passSrc]);
    expect(r).toBeDefined();
    const { status, issues } = runVitest(r!.outFile);
    expect(status).toBe(0);
    expect(issues).toEqual([]);
  });

  it("a false property fails vitest with a structured counterexample", { timeout: 30000 }, () => {
    const [r] = generate([failSrc]);
    expect(r).toBeDefined();
    const { status, issues } = runVitest(r!.outFile);
    expect(status).not.toBe(0);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      property: "wrong",
      kind: "falsified",
      counterexample: { x: 1 },
    });
  });
});
