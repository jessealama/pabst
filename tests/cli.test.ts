import {
  describe,
  it,
  expect,
  afterAll,
  beforeAll,
  beforeEach,
  vi,
} from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { main } from "../src/cli.js";

const repoRoot = process.cwd();

describe("cli main", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pabst-cli-"));
  const prevCwd = process.cwd();

  beforeAll(() => {
    fs.writeFileSync(
      path.join(dir, "baz.ts"),
      `/** @ensures{pos} forall (n: nat), baz(n) >= 0 */\nexport function baz(n: number): number { return n; }\n`,
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
    expect(fs.existsSync(path.join(dir, ".pabst", "baz.pabst.test.ts"))).toBe(
      true,
    );
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

  it("returns 2 when no .ts files match the patterns", () => {
    expect(main(["gen", "*.nope"])).toBe(2);
  });
});

// README usage claims: `pabst test` prints a single JSON envelope to stdout,
// exits 0/1 on clean/failing runs, echoes the seed, and reproduces a run when
// the seed is passed back. The generated tests import "pabst/runtime" via the
// package self-reference, so these must run inside the repo tree (a gitignored
// scratch dir under .pabst/), unlike the os.tmpdir()-based `gen` suite above.
describe("cli test command (README usage claims)", () => {
  const workDir = path.join(repoRoot, ".pabst", "clitest");

  function runMain(argv: string[]): { code: number; stdout: string[] } {
    const stdout: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((s) => {
      stdout.push(String(s));
    });
    try {
      return { code: main(argv), stdout };
    } finally {
      spy.mockRestore();
    }
  }

  beforeAll(() => {
    fs.rmSync(workDir, { recursive: true, force: true });
    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(
      path.join(workDir, "good.ts"),
      `/** @ensures{nonneg} forall (n: nat), good(n) >= 0 */\nexport function good(n: number): number { return n; }\n`,
      "utf8",
    );
    fs.writeFileSync(
      path.join(workDir, "bad.ts"),
      `/** @ensures{negative} forall (n: nat), bad(n) < 0 */\nexport function bad(n: number): number { return n; }\n`,
      "utf8",
    );
    process.chdir(workDir);
  });
  afterAll(() => {
    process.chdir(repoRoot);
    fs.rmSync(workDir, { recursive: true, force: true });
  });
  // `pabst test` always runs the whole .pabst dir, so wipe it between tests to
  // keep each envelope scoped to the files that test generated.
  beforeEach(() => {
    fs.rmSync(path.join(workDir, ".pabst"), { recursive: true, force: true });
  });

  it(
    "test on a clean file prints one JSON envelope to stdout and exits 0",
    { timeout: 60000 },
    () => {
      const { code, stdout } = runMain(["test", "good.ts"]);
      expect(code).toBe(0);
      expect(stdout).toHaveLength(1);
      const env = JSON.parse(stdout[0]!);
      const pkg = JSON.parse(
        fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"),
      );
      expect(env).toMatchObject({
        version: pkg.version,
        cwd: process.cwd(),
        generated: 1,
        passed: 1,
        failed: 0,
        issues: [],
      });
      expect(env.startedAt).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );
      expect(Number.isInteger(env.seed)).toBe(true);
      expect(env.seed).toBeGreaterThanOrEqual(0);
      expect(env.seed).toBeLessThan(2 ** 32);
    },
  );

  it(
    "test on a failing file exits 1 with a structured issue in the envelope",
    { timeout: 60000 },
    () => {
      const { code, stdout } = runMain(["test", "bad.ts"]);
      expect(code).toBe(1);
      const env = JSON.parse(stdout[0]!);
      expect(env).toMatchObject({ generated: 1, passed: 0, failed: 1 });
      expect(env.issues).toEqual([
        {
          file: "bad.ts",
          function: "bad",
          property: "negative",
          kind: "falsified",
          counterexample: { n: 0 },
        },
      ]);
    },
  );

  it(
    "test --seed echoes the given seed in the envelope",
    { timeout: 60000 },
    () => {
      const { code, stdout } = runMain(["test", "--seed", "123", "good.ts"]);
      expect(code).toBe(0);
      expect(JSON.parse(stdout[0]!).seed).toBe(123);
    },
  );

  it(
    "passing a prior run's seed back reproduces that run",
    { timeout: 120000 },
    () => {
      const first = JSON.parse(runMain(["test", "bad.ts"]).stdout[0]!);
      fs.rmSync(path.join(workDir, ".pabst"), { recursive: true, force: true });
      const second = JSON.parse(
        runMain(["test", "--seed", String(first.seed), "bad.ts"]).stdout[0]!,
      );
      expect(second.seed).toBe(first.seed);
      expect(second.issues).toEqual(first.issues);
      expect(second.passed).toBe(first.passed);
      expect(second.failed).toBe(first.failed);
    },
  );

  it(
    "test accepts globs and reports across all matched files",
    { timeout: 60000 },
    () => {
      const { code, stdout } = runMain(["test", "*.ts"]);
      expect(code).toBe(1);
      const env = JSON.parse(stdout[0]!);
      expect(env).toMatchObject({ generated: 2, passed: 1, failed: 1 });
      expect(env.issues).toHaveLength(1);
    },
  );
});
