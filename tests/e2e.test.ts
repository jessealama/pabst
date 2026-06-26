import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { generate } from "../src/codegen.js";

const root = process.cwd();
const passSrc = path.join(root, "tests/fixtures/e2e/pass.ts");
const failSrc = path.join(root, "tests/fixtures/e2e/fail.ts");
const genDir = path.join(root, ".pabst/tests/fixtures/e2e");

function clean(): void {
  fs.rmSync(genDir, { recursive: true, force: true });
}

function runVitest(file: string): { status: number; output: string } {
  const res = spawnSync("npx", ["vitest", "run", file], { encoding: "utf8" });
  return { status: res.status ?? 1, output: (res.stdout ?? "") + (res.stderr ?? "") };
}

describe("end-to-end", () => {
  beforeAll(clean);
  afterAll(clean);

  it("a true property passes vitest", { timeout: 30000 }, () => {
    const [r] = generate([passSrc]);
    expect(r).toBeDefined();
    const { status } = runVitest(r!.outFile);
    expect(status).toBe(0);
  });

  it("a false property fails vitest with a counterexample", { timeout: 30000 }, () => {
    const [r] = generate([failSrc]);
    expect(r).toBeDefined();
    const { status, output } = runVitest(r!.outFile);
    expect(status).not.toBe(0);
    // the reporter binds the counterexample to the binder name
    expect(output).toMatch(/property 'wrong' falsified by x = 1/);
  });
});
