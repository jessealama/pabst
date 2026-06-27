import { describe, it, expect } from "vitest";
import { ISSUE_SENTINEL, parseIssue, type Issue } from "../src/issue.js";

describe("parseIssue", () => {
  const issue: Issue = {
    file: "foo/bar.mts",
    function: "jazz",
    property: "isSymmetric",
    kind: "falsified",
    counterexample: { x: 1, y: "hello" },
  };

  it("extracts a tagged issue from a bare sentinel message", () => {
    expect(parseIssue(ISSUE_SENTINEL + JSON.stringify(issue))).toEqual(issue);
  });

  it("extracts the issue even when a stack trace follows on later lines", () => {
    const raw = `Error: ${ISSUE_SENTINEL}${JSON.stringify(issue)}\n    at report (/x/runtime.js:1:1)\n    at y`;
    expect(parseIssue(raw)).toEqual(issue);
  });

  it("returns null when the sentinel is absent", () => {
    expect(parseIssue("Error: some unrelated failure")).toBeNull();
  });

  it("returns null when the tagged payload is not valid JSON", () => {
    expect(parseIssue(ISSUE_SENTINEL + "{not json")).toBeNull();
  });

  it("returns null when a brace-balanced payload still fails to parse", () => {
    // Matches ISSUE_RE (has a closing brace) but is not valid JSON, so the
    // JSON.parse catch — not the no-match path — produces the null.
    expect(parseIssue(ISSUE_SENTINEL + "{not: json}")).toBeNull();
  });
});
