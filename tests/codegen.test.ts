import { describe, it, expect, afterAll, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { generate } from "../src/codegen.js";

describe("generate", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pabst-codegen-"));
  const prevCwd = process.cwd();

  beforeAll(() => {
    fs.writeFileSync(
      path.join(dir, "bar.ts"),
      `/** @ensures{pos} forall (n: nat), bar(n) >= 0 */\nexport function bar(n: number): number { return n; }\n`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(dir, "plain.ts"),
      `export function plain(n: number): number { return n; }\n`,
      "utf8",
    );
    process.chdir(dir);
  });
  afterAll(() => {
    process.chdir(prevCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("writes one generated test file and reports the count", () => {
    const results = generate(["bar.ts"], ".pabst", 7);
    expect(results).toHaveLength(1);
    expect(results[0]!.propertyCount).toBe(1);
    expect(results[0]!.outFile).toBe(path.join(".pabst", "bar.pabst.test.ts"));
    expect(fs.existsSync(results[0]!.outFile)).toBe(true);
    const code = fs.readFileSync(results[0]!.outFile, "utf8");
    expect(code).toContain('test.prop([fc.nat()], { seed: 7, reporter: (d) => __pabstReport("bar.ts", "bar", "pos", ["n"], d) })("pos"');
    expect(code).toContain("const { bar } = __M;");
  });

  it("skips a file with no @ensures annotations", () => {
    const results = generate(["plain.ts"], ".pabst", 7);
    expect(results).toEqual([]);
    expect(fs.existsSync(path.join(".pabst", "plain.pabst.test.ts"))).toBe(false);
  });
});
