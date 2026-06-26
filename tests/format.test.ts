import { describe, it, expect } from "vitest";
import { formatRun, cleanFailure, type VitestJson } from "../src/format.js";

const FAIL_MSG =
  "Error: property 'wrong' falsified by x = 1\n" +
  "    at report (/x/dist/runtime.js:19:11)\n" +
  "    at Object.reporter (/x/.pabst/fail.pabst.test.ts:9:46)";

function run(over: Partial<VitestJson>): VitestJson {
  return { numPassedTests: 0, numFailedTests: 0, success: true, testResults: [], ...over };
}

describe("cleanFailure", () => {
  it("strips the stack and the Error: prefix", () => {
    expect(cleanFailure(FAIL_MSG)).toBe("property 'wrong' falsified by x = 1");
  });

  it("keeps an appended thrown-exception message but drops the stack", () => {
    const raw = "Error: property 'p' falsified by x = 1\n  kaboom at 1\n    at report (/x.js:1:1)";
    expect(cleanFailure(raw)).toBe("property 'p' falsified by x = 1\n  kaboom at 1");
  });
});

describe("formatRun", () => {
  it("renders a one-line summary when everything passes", () => {
    expect(formatRun(run({ numPassedTests: 3, success: true }))).toBe("pabst: 3 passed");
  });

  it("lists each failure with its function › property path and clean message", () => {
    const out = formatRun(
      run({
        numPassedTests: 0,
        numFailedTests: 1,
        success: false,
        testResults: [
          {
            assertionResults: [
              {
                status: "failed",
                title: "wrong (with seed=-573625524)",
                ancestorTitles: ["pabst", "isZero"],
                failureMessages: [FAIL_MSG],
              },
            ],
          },
        ],
      }),
    );
    expect(out).toBe(
      ["pabst: 1 failed, 0 passed", "", "  ✗ isZero › wrong", "    property 'wrong' falsified by x = 1"].join("\n"),
    );
  });

  it("omits passing assertions from the failure list", () => {
    const out = formatRun(
      run({
        numPassedTests: 1,
        numFailedTests: 1,
        success: false,
        testResults: [
          {
            assertionResults: [
              { status: "passed", title: "ok", ancestorTitles: ["pabst", "f"], failureMessages: [] },
              { status: "failed", title: "bad (with seed=1)", ancestorTitles: ["pabst", "f"], failureMessages: [FAIL_MSG] },
            ],
          },
        ],
      }),
    );
    expect(out).toContain("pabst: 1 failed, 1 passed");
    expect(out).toContain("  ✗ f › bad");
    expect(out).not.toContain("ok");
  });
});
