import { describe, it, expect, afterAll, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { main } from "../src/cli.js";

describe("cli main", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pabst-cli-"));
  const prevCwd = process.cwd();

  beforeAll(() => {
    fs.writeFileSync(
      path.join(dir, "baz.ts"),
      `/** @ensures{pos} (n: nat) => baz(n) >= 0 */\nexport function baz(n: number): number { return n; }\n`,
      "utf8",
    );
    process.chdir(dir);
  });
  afterAll(() => {
    process.chdir(prevCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("gen writes generated files and returns 0", () => {
    const code = main(["gen", "baz.ts"]);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(dir, ".pabst", "baz.pabst.test.ts"))).toBe(true);
  });

  it("returns 2 on unknown command", () => {
    expect(main(["frobnicate", "baz.ts"])).toBe(2);
  });

  it("returns 2 when no patterns are given", () => {
    expect(main(["gen"])).toBe(2);
  });

  it("returns 2 on a non-integer --seed", () => {
    expect(main(["gen", "--seed", "4.2", "baz.ts"])).toBe(2);
  });

  it("returns 2 on an out-of-range --seed", () => {
    expect(main(["gen", "--seed", String(2 ** 32), "baz.ts"])).toBe(2);
  });

  it("gen accepts a valid --seed and returns 0", () => {
    expect(main(["gen", "--seed", "123", "baz.ts"])).toBe(0);
  });
});
