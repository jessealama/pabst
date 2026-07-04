import { describe, it, expect, afterAll, beforeAll, beforeEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { runMain, useTempProject } from "./helpers/cli.js";
import { expectValidIssue } from "./helpers/issue-schema.js";

const repoRoot = process.cwd();

describe("cli main", () => {
  const dir = useTempProject("pabst-cli-", {
    "baz.ts": `/** @ensures{pos} forall (n: nat), baz(n) >= 0 */\nexport function baz(n: number): number { return n; }\n`,
  });

  it("gen writes generated files and returns 0", () => {
    const { code } = runMain(["gen", "baz.ts"]);
    expect(code).toBe(0);
    expect(fs.existsSync(path.join(dir, ".pabst", "baz.pabst.test.ts"))).toBe(
      true,
    );
  });

  it("returns 2 on unknown command", () => {
    expect(runMain(["frobnicate", "baz.ts"]).code).toBe(2);
  });

  it("returns 2 when no patterns are given", () => {
    expect(runMain(["gen"]).code).toBe(2);
  });

  it("returns 2 on a non-integer --seed", () => {
    expect(runMain(["gen", "--seed", "4.2", "baz.ts"]).code).toBe(2);
  });

  it("returns 2 on an out-of-range --seed", () => {
    expect(runMain(["gen", "--seed", String(2 ** 32), "baz.ts"]).code).toBe(2);
  });

  it("gen accepts a valid --seed and returns 0", () => {
    expect(runMain(["gen", "--seed", "123", "baz.ts"]).code).toBe(0);
  });

  it("returns 2 when no .ts files match the patterns", () => {
    expect(runMain(["gen", "*.nope"]).code).toBe(2);
  });
});

// Issue #12: user-facing compile errors (malformed formulas, unsupported
// constructs, bad references) must exit 2 with a one-line diagnostic, not
// escape main() as an uncaught exception. One case per PabstError-throwing
// module keeps the whole compile front-end pinned to the contract: reverting
// any module's throws to plain Error fails its case here. These use
// `pabst test` — compilation fails before vitest is spawned, so no timeout
// is needed.
//
// `wrapped` marks errors thrown per-annotation inside buildSpec, which the
// build-spec seam prefixes with `file:line: @ensures{name}:`. Extract-phase
// errors (duplicate names, ineligible/unexported classes) are thrown before
// any single annotation is compiled, so they carry no such prefix — their
// messages name the file and subject themselves.
interface CompileErrorCase {
  name: string;
  file: string;
  source: string;
  wrapped: boolean;
  property: string;
  expected: string[];
}

const COMPILE_ERROR_CASES: CompileErrorCase[] = [
  {
    name: "a malformed quantifier prefix (prefix-parser)",
    file: "malformed.ts",
    source: `/** @ensures{shapely} for every (n: nat), malformed(n) >= 0 */\nexport function malformed(n: number): number { return n; }\n`,
    wrapped: true,
    property: "shapely",
    expected: ["expected 'forall'"],
  },
  {
    name: "an unexported-symbol reference (free-idents)",
    file: "unexported.ts",
    source: `/** @ensures{agrees} forall (n: nat), unexported(n) === helper(n) */\nexport function unexported(n: number): number { return n; }\nfunction helper(n: number): number { return n; }\n`,
    wrapped: true,
    property: "agrees",
    expected: ["'helper'", "not exported"],
  },
  {
    name: "a leading existential quantifier (prefix-parser)",
    file: "existential.ts",
    source: `/** @ensures{someone} exists (n: nat), ex(n) > 0 */\nexport function ex(n: number): number { return n; }\n`,
    wrapped: true,
    property: "someone",
    expected: ["existential quantifiers"],
  },
  {
    name: "an unsupported domain (prefix-parser)",
    file: "baddomain.ts",
    source: `/** @ensures{rounds} forall (x: float), rounder(x) >= 0 */\nexport function rounder(x: number): number { return x; }\n`,
    wrapped: true,
    property: "rounds",
    expected: ["unknown generation domain 'float'"],
  },
  {
    name: "an existential inside the body (formula-lexer)",
    file: "bodyexists.ts",
    source: `/** @ensures{someInBody} forall (n: nat), inBody(n) > 0 ∧ exists m, inBody(m) === 0 */\nexport function inBody(n: number): number { return n; }\n`,
    wrapped: true,
    property: "someInBody",
    expected: ["existential quantifiers"],
  },
  {
    name: "a nested forall inside the body (formula-lexer)",
    file: "nestedforall.ts",
    source: `/** @ensures{deep} forall (n: nat), forall (m: nat), nested(n) >= 0 */\nexport function nested(n: number): number { return n; }\n`,
    wrapped: true,
    property: "deep",
    expected: ["nested quantifiers"],
  },
  {
    name: "JS && at the property's top level (formula-parser)",
    file: "jsconj.ts",
    source: `/** @ensures{conj} forall (n: nat), jsconj(n) >= 0 && jsconj(n) >= 0 */\nexport function jsconj(n: number): number { return n; }\n`,
    wrapped: true,
    property: "conj",
    expected: ["use ∧ for conjunction"],
  },
  {
    name: "a duplicate property name (extract)",
    file: "dup.ts",
    source: `/**\n * @ensures{same} forall (n: nat), dup(n) >= 0\n * @ensures{same} forall (n: nat), dup(n) >= 0\n */\nexport function dup(n: number): number { return n; }\n`,
    wrapped: false,
    property: "same",
    expected: ["duplicate property name 'same'", "dup.ts"],
  },
  {
    name: "an @ensures on an unexported class (extract)",
    file: "hidden.ts",
    source: `class Hidden {\n  /** @ensures{h} forall (n: nat), n >= 0 */\n  m(n: number): number { return n; }\n}\n`,
    wrapped: false,
    property: "h",
    expected: ["class 'Hidden'", "not exported", "hidden.ts"],
  },
];

describe("cli compile errors (exit-code contract)", () => {
  useTempProject(
    "pabst-cli-err-",
    Object.fromEntries(COMPILE_ERROR_CASES.map((c) => [c.file, c.source])),
  );

  it.each(COMPILE_ERROR_CASES)(
    "test on $name exits 2 with a one-line diagnostic",
    (c) => {
      const { code, stderr } = runMain(["test", c.file]);
      expect(code).toBe(2);
      expect(stderr).toHaveLength(1);
      expect(stderr[0]).not.toContain("\n");
      if (c.wrapped) {
        expect(stderr[0]).toContain(`${c.file}:1: @ensures{${c.property}}:`);
      }
      for (const fragment of c.expected) {
        expect(stderr[0]).toContain(fragment);
      }
    },
  );

  it("gen on a malformed @ensures exits 2 with the same diagnostic", () => {
    const { code, stderr } = runMain(["gen", "malformed.ts"]);
    expect(code).toBe(2);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toContain("malformed.ts:1");
    expect(stderr[0]).toContain("shapely");
  });
});

// README usage claims: `pabst test` prints a single JSON envelope to stdout,
// exits 0/1 on clean/failing runs, echoes the seed, and reproduces a run when
// the seed is passed back. The generated tests import "pabst/runtime" via the
// package self-reference, so these must run inside the repo tree (a gitignored
// scratch dir under .pabst/), unlike the os.tmpdir()-based suites above.
describe("cli test command (README usage claims)", () => {
  const workDir = path.join(repoRoot, ".pabst", "clitest");

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
      // The exact issue contents are pinned by the envelope and run-seam
      // suites; here only the CLI-level claim matters.
      expect(env.issues).toHaveLength(1);
      expectValidIssue(env.issues[0]);
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
