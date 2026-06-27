import { describe, it, expect } from "vitest";
import { buildEnvelope, collectIssues, type VitestJson, type RunMeta } from "../src/envelope.js";
import { ISSUE_SENTINEL, type Issue } from "../src/issue.js";

const META: RunMeta = {
  version: "0.0.1",
  startedAt: "2026-06-26T00:00:00.000Z",
  cwd: "/repo",
  seed: 12345,
  generated: 3,
};

function failed(issue: Issue): { status: string; failureMessages: string[] } {
  return { status: "failed", failureMessages: [`Error: ${ISSUE_SENTINEL}${JSON.stringify(issue)}\n    at x`] };
}

function vitestJson(over: Partial<VitestJson>): VitestJson {
  return { numPassedTests: 0, numFailedTests: 0, success: true, testResults: [], ...over };
}

const FALSIFIED: Issue = { file: "a.ts", function: "f", property: "p", kind: "falsified", counterexample: { x: 1 } };
const THREW: Issue = { file: "a.ts", function: "f", property: "q", kind: "threw", counterexample: { x: 0 }, error: "boom" };
const EXHAUSTED: Issue = { file: "a.ts", function: "f", property: "r", kind: "exhausted", error: "too many skipped runs" };

describe("collectIssues", () => {
  it("collects only failed assertions and parses each issue", () => {
    const json = vitestJson({
      testResults: [
        {
          assertionResults: [
            { status: "passed", failureMessages: [] },
            failed(FALSIFIED),
            failed(THREW),
            failed(EXHAUSTED),
          ],
        },
      ],
    });
    expect(collectIssues(json)).toEqual([FALSIFIED, THREW, EXHAUSTED]);
  });

  it("tolerates missing testResults and assertionResults arrays", () => {
    expect(collectIssues({} as VitestJson)).toEqual([]);
    expect(collectIssues({ testResults: [{} as never] } as VitestJson)).toEqual([]);
  });

  it("ignores a failed assertion that carries no failure message", () => {
    const json = vitestJson({
      testResults: [{ assertionResults: [{ status: "failed", failureMessages: [] }] }],
    });
    expect(collectIssues(json)).toEqual([]);
  });
});

describe("buildEnvelope", () => {
  it("wraps issues with run metadata and vitest counts", () => {
    const json = vitestJson({
      numPassedTests: 2,
      numFailedTests: 1,
      success: false,
      testResults: [{ assertionResults: [failed(FALSIFIED)] }],
    });
    expect(buildEnvelope(META, json)).toEqual({
      version: "0.0.1",
      startedAt: "2026-06-26T00:00:00.000Z",
      cwd: "/repo",
      seed: 12345,
      generated: 3,
      passed: 2,
      failed: 1,
      issues: [FALSIFIED],
    });
  });

  it("produces an empty issues array on a clean run", () => {
    const env = buildEnvelope(META, vitestJson({ numPassedTests: 3, success: true }));
    expect(env.issues).toEqual([]);
    expect(env.failed).toBe(0);
    expect(env.passed).toBe(3);
  });
});
