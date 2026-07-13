import { describe, it, expect, afterAll, beforeAll } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { generate } from "../src/codegen.js";
import { runTests } from "../src/run.js";
import type { Envelope } from "../src/issue.js";
import { expectValidIssue } from "./helpers/issue-schema.js";
import { META } from "./helpers/fixtures.js";

const root = process.cwd();
const passSrc = path.join(root, "tests/fixtures/e2e/pass.ts");
const failSrc = path.join(root, "tests/fixtures/e2e/fail.ts");
const classPassSrc = path.join(root, "tests/fixtures/e2e/class-pass.ts");
const classFailSrc = path.join(root, "tests/fixtures/e2e/class-fail.ts");
const nearMissSrc = path.join(root, "tests/fixtures/e2e/near-miss.ts");
const stringLawsSrc = path.join(root, "tests/fixtures/e2e/string-laws.ts");
const intRoundTripSrc = path.join(root, "tests/fixtures/e2e/int-round-trip.ts");
const floatAssocSrc = path.join(
  root,
  "tests/fixtures/e2e/float-associativity.ts",
);
const parseRoundTripSrc = path.join(
  root,
  "tests/fixtures/e2e/parse-round-trip.ts",
);
const safeSqrtSrc = path.join(root, "tests/fixtures/e2e/safe-sqrt.ts");
const boundedSrc = path.join(root, "tests/fixtures/e2e/bounded.ts");
const regexGuardSrc = path.join(root, "tests/fixtures/e2e/regex-guard.ts");
const equationPassSrc = path.join(root, "tests/fixtures/e2e/equation-pass.ts");
const equationFailSrc = path.join(root, "tests/fixtures/e2e/equation-fail.ts");
const exhaustedSrc = path.join(
  root,
  "tests/fixtures/e2e/precondition-exhausted.ts",
);
const connectivesSrc = path.join(root, "tests/fixtures/e2e/connectives.ts");
const atomNotBoolSrc = path.join(
  root,
  "tests/fixtures/e2e/atom-not-boolean.ts",
);
const readmeExampleSrc = path.join(
  root,
  "tests/fixtures/e2e/readme-example.ts",
);
const genDir = path.join(root, ".pabst/tests/fixtures/e2e");

function clean(): void {
  fs.rmSync(genDir, { recursive: true, force: true });
}

// A suite-private results file: the CLI's real .pabst/.last-run.json must
// survive a run of this suite untouched.
const E2E_RESULTS = ".pabst/.e2e-run.json";

function run(file: string): Envelope {
  const result = runTests(file, META, E2E_RESULTS);
  if (result.kind !== "completed") {
    throw new Error(`vitest run failed: ${JSON.stringify(result)}`);
  }
  return result.envelope;
}

describe("end-to-end", () => {
  beforeAll(clean);
  afterAll(clean);

  it("a true property passes vitest", { timeout: 30000 }, () => {
    const [r] = generate([passSrc]);
    expect(r).toBeDefined();
    const env = run(r!.outFile);
    expect(env.failed).toBe(0);
    expect(env.issues).toEqual([]);
  });

  it(
    "a false property fails vitest with a structured counterexample",
    { timeout: 30000 },
    () => {
      const [r] = generate([failSrc]);
      expect(r).toBeDefined();
      const env = run(r!.outFile);
      expect(env.failed).toBeGreaterThan(0);
      expect(env.issues).toHaveLength(1);
      expectValidIssue(env.issues[0]);
      expect(env.issues[0]).toMatchObject({
        property: "wrong",
        kind: "falsified",
        counterexample: { x: 1 },
      });
    },
  );

  // Seed 3 is pinned: these fixtures each fail for a single input (x=0 / +0), and
  // fast-check does NOT reliably probe 0 on a random seed (~50% miss rate), so an
  // unseeded run is a coin flip. Seed 3 is verified to probe 0 for both fc.nat()
  // and fc.double().
  it(
    "class instance + static properties that hold pass vitest",
    { timeout: 30000 },
    () => {
      const [r] = generate([classPassSrc], ".pabst", 3);
      expect(r).toBeDefined();
      const env = run(r!.outFile);
      expect(env.failed).toBe(0);
      expect(env.issues).toEqual([]);
    },
  );

  it(
    "a buggy instance method is flagged as Class#method",
    { timeout: 30000 },
    () => {
      const [r] = generate([classFailSrc], ".pabst", 3);
      expect(r).toBeDefined();
      const env = run(r!.outFile);
      expect(env.failed).toBeGreaterThan(0);
      expect(env.issues).toHaveLength(1);
      expectValidIssue(env.issues[0]);
      expect(env.issues[0]).toMatchObject({
        function: "BoundedCounter#dec",
        property: "neverNegative",
        kind: "falsified",
        counterexample: { x: 0 },
      });
    },
  );

  it(
    "a static-method near-miss is flagged as Class.method with the -0 counterexample",
    { timeout: 30000 },
    () => {
      const [r] = generate([nearMissSrc], ".pabst", 3);
      expect(r).toBeDefined();
      const env = run(r!.outFile);
      expect(env.failed).toBeGreaterThan(0);
      expect(env.issues).toHaveLength(1);
      expectValidIssue(env.issues[0]);
      expect(env.issues[0]).toMatchObject({
        function: "Arith.negate",
        property: "matchesSubtraction",
        kind: "falsified",
        counterexample: { x: 0 },
      });
    },
  );

  it(
    "the README front-page example is verbatim on disk and is falsified",
    { timeout: 30000 },
    () => {
      const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
      const block = /```ts\n([\s\S]*?)```/.exec(readme)?.[1];
      expect(block, "README has no ```ts code block").toBeDefined();
      expect(
        fs.readFileSync(readmeExampleSrc, "utf8"),
        "tests/fixtures/e2e/readme-example.ts must be byte-identical to the README's first ts block",
      ).toBe(block);
      const [r] = generate([readmeExampleSrc], ".pabst", 3);
      expect(r).toBeDefined();
      const env = run(r!.outFile);
      expect(env.failed).toBeGreaterThan(0);
      expect(env.issues).toHaveLength(1);
      expectValidIssue(env.issues[0]);
      expect(env.issues[0]).toMatchObject({
        function: "foo",
        property: "nonzero",
        kind: "falsified",
      });
      expect(Object.keys(env.issues[0]!.counterexample ?? {})).toEqual([
        "x",
        "y",
      ]);
    },
  );

  it("README string laws (contains) pass vitest", { timeout: 30000 }, () => {
    const [r] = generate([stringLawsSrc]);
    expect(r).toBeDefined();
    const env = run(r!.outFile);
    expect(env.failed).toBe(0);
    expect(env.issues).toEqual([]);
  });

  it("Number(String(x)) round-trips over int", { timeout: 30000 }, () => {
    const [r] = generate([intRoundTripSrc]);
    expect(r).toBeDefined();
    const env = run(r!.outFile);
    expect(env.failed).toBe(0);
    expect(env.issues).toEqual([]);
  });

  it(
    "float addition is NOT associative (falsified)",
    { timeout: 30000 },
    () => {
      const [r] = generate([floatAssocSrc], ".pabst", 1);
      expect(r).toBeDefined();
      const env = run(r!.outFile);
      expect(env.failed).toBeGreaterThan(0);
      expect(env.issues).toHaveLength(1);
      expectValidIssue(env.issues[0]);
      expect(env.issues[0]).toMatchObject({
        property: "associative",
        kind: "falsified",
      });
      expect(Object.keys(env.issues[0]!.counterexample ?? {})).toEqual([
        "x",
        "y",
        "z",
      ]);
    },
  );

  it(
    "parseInt is NOT the inverse of String over doubles (falsified)",
    { timeout: 30000 },
    () => {
      const [r] = generate([parseRoundTripSrc], ".pabst", 3);
      expect(r).toBeDefined();
      const env = run(r!.outFile);
      expect(env.failed).toBeGreaterThan(0);
      expect(env.issues).toHaveLength(1);
      expectValidIssue(env.issues[0]);
      expect(env.issues[0]).toMatchObject({
        property: "parseIntInverts",
        kind: "falsified",
      });
      expect(Object.keys(env.issues[0]!.counterexample ?? {})).toEqual(["x"]);
    },
  );

  it(
    "a property whose body throws is reported as kind 'threw'",
    { timeout: 30000 },
    () => {
      const [r] = generate([safeSqrtSrc], ".pabst", 3);
      expect(r).toBeDefined();
      const env = run(r!.outFile);
      expect(env.failed).toBeGreaterThan(0);
      expect(env.issues).toHaveLength(1);
      expectValidIssue(env.issues[0]);
      expect(env.issues[0]).toMatchObject({
        property: "nonNegativeRoot",
        kind: "threw",
      });
      expect(env.issues[0]!.error).toContain("negative");
      expect(Object.keys(env.issues[0]!.counterexample ?? {})).toEqual(["x"]);
    },
  );

  it(
    "an unsatisfiable precondition is reported as kind 'exhausted'",
    { timeout: 30000 },
    () => {
      const [r] = generate([exhaustedSrc]);
      expect(r).toBeDefined();
      const env = run(r!.outFile);
      expect(env.failed).toBeGreaterThan(0);
      expect(env.issues).toHaveLength(1);
      expectValidIssue(env.issues[0]);
      expect(env.issues[0]).toMatchObject({
        property: "unsatisfiable",
        kind: "exhausted",
      });
      expect(env.issues[0]!.counterexample).toBeUndefined();
    },
  );

  it(
    "interval-bounded binders only generate in-range values",
    { timeout: 30000 },
    () => {
      const [r] = generate([boundedSrc]);
      expect(r).toBeDefined();
      const env = run(r!.outFile);
      expect(env.failed).toBe(0);
      expect(env.issues).toEqual([]);
    },
  );

  it(
    "regex-guarded string binders only generate matching values",
    { timeout: 30000 },
    () => {
      const [r] = generate([regexGuardSrc]);
      expect(r).toBeDefined();
      // Pin the emitted arbitraries: anchored, non-capturing, flags kept.
      const emitted = fs.readFileSync(r!.outFile, "utf8");
      expect(emitted).toContain("fc.stringMatching(/^(?:[a-z]+)$/)");
      expect(emitted).toContain("fc.stringMatching(/^(?:\\p{Lu}{2,5})$/u)");
      const env = run(r!.outFile);
      expect(env.failed).toBe(0);
      expect(env.issues).toEqual([]);
    },
  );

  it(
    "equation syntax: guarded identities pass vitest",
    { timeout: 30000 },
    () => {
      const [r] = generate([equationPassSrc], ".pabst", 3);
      expect(r).toBeDefined();
      const env = run(r!.outFile);
      expect(env.failed).toBe(0);
      expect(env.issues).toEqual([]);
    },
  );

  it(
    "equation syntax: the -0 near-miss is refuted via ≡",
    { timeout: 30000 },
    () => {
      const [r] = generate([equationFailSrc], ".pabst", 3);
      expect(r).toBeDefined();
      const env = run(r!.outFile);
      expect(env.failed).toBeGreaterThan(0);
      expect(env.issues).toHaveLength(1);
      expectValidIssue(env.issues[0]);
      expect(env.issues[0]).toMatchObject({
        function: "negate",
        property: "matchesSubtraction",
        kind: "falsified",
        counterexample: { x: 0 },
      });
    },
  );
});

describe("e2e — math-y connectives", () => {
  afterAll(clean);

  it(
    "passes a De Morgan biconditional and a guarded implication",
    { timeout: 30000 },
    () => {
      clean();
      const [res] = generate([connectivesSrc], ".pabst", 1234);
      const env = run(res!.outFile);
      expect(env.issues).toEqual([]);
      expect(env.failed).toBe(0);
    },
  );

  it(
    "reports a threw issue naming a non-boolean atom",
    { timeout: 30000 },
    () => {
      clean();
      const [res] = generate([atomNotBoolSrc], ".pabst", 1234);
      const env = run(res!.outFile);
      const issue = env.issues.find((i) => i.property === "notBool");
      expect(issue?.kind).toBe("threw");
      expect(issue?.error).toMatch(
        /atom "addOne\(x\)" evaluated to .*not a boolean/,
      );
      expectValidIssue(issue);
    },
  );
});
