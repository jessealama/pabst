import { describe, it, expect } from "vitest";
import { expectValidIssue } from "./helpers/issue-schema.js";

describe("issue schema", () => {
  it("accepts a falsified issue with an instance-method name", () => {
    expect(() =>
      expectValidIssue({
        file: "f.ts",
        function: "Counter#inc",
        property: "p",
        kind: "falsified",
        counterexample: { x: 0 },
      }),
    ).not.toThrow();
  });

  it("accepts a falsified issue with a static-method name", () => {
    expect(() =>
      expectValidIssue({
        file: "f.ts",
        function: "Arith.negate",
        property: "p",
        kind: "falsified",
        counterexample: { x: 0 },
      }),
    ).not.toThrow();
  });

  it("accepts an exhausted issue", () => {
    expect(() =>
      expectValidIssue({
        file: "f.ts",
        function: "f",
        property: "p",
        kind: "exhausted",
        error: "too many skipped runs",
      }),
    ).not.toThrow();
  });

  it("rejects a falsified issue that also carries an error", () => {
    expect(() =>
      expectValidIssue({
        file: "f.ts",
        function: "f",
        property: "p",
        kind: "falsified",
        counterexample: { x: 0 },
        error: "nope",
      }),
    ).toThrow();
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      expectValidIssue({
        file: "f.ts",
        function: "f",
        property: "p",
        kind: "boom",
      }),
    ).toThrow();
  });

  it("rejects a malformed function name", () => {
    expect(() =>
      expectValidIssue({
        file: "f.ts",
        function: "1 bad",
        property: "p",
        kind: "falsified",
        counterexample: { x: 0 },
      }),
    ).toThrow();
  });
});
