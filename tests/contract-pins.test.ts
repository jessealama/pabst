import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  BOOL_ALIAS,
  BOOL_EXPORT,
  encodeIssue,
  FC_PROPERTY_FAILED_MESSAGE,
  ISSUE_SENTINEL,
  parseIssue,
  REPORT_ALIAS,
  REPORT_EXPORT,
  RUNTIME_SPECIFIER,
  type Issue,
} from "../src/contract.js";
import {
  QUALIFIED_NAME_PATTERN,
  qualifiedName,
} from "../src/qualified-name.js";
import * as runtime from "../src/runtime.js";
import type { z } from "zod";
import type { IssueSchema } from "../src/issue-schema.js";

describe("contract pins", () => {
  it("pins the literal spellings of the contract constants", () => {
    // Golden pins: changing any constant is a deliberate act that must
    // update this test — and changes every user's generated output.
    expect(ISSUE_SENTINEL).toBe("PABST_ISSUE:");
    expect(BOOL_ALIAS).toBe("__bool");
    expect(REPORT_ALIAS).toBe("__pabstReport");
    expect(BOOL_EXPORT).toBe("bool");
    expect(REPORT_EXPORT).toBe("report");
    expect(RUNTIME_SPECIFIER).toBe("pabst-checker/runtime");
  });

  it("round-trips an issue through the wire codec, stack trace ignored", () => {
    const issue: Issue = {
      file: "f.ts",
      function: "Counter#inc",
      property: "p",
      kind: "falsified",
      counterexample: { x: 0 },
    };
    const wire = encodeIssue(issue) + "\n    at report (runtime.ts:1:1)";
    expect(parseIssue(wire)).toEqual(issue);
  });

  it("spells the runtime specifier as package.json's name + /runtime", () => {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    );
    expect(RUNTIME_SPECIFIER).toBe(`${pkg.name}/runtime`);
    expect(Object.keys(pkg.exports)).toContain("./runtime");
  });

  it("binds aliases to exports the runtime actually has", () => {
    const mod = runtime as Record<string, unknown>;
    expect(typeof mod[BOOL_EXPORT]).toBe("function");
    expect(typeof mod[REPORT_EXPORT]).toBe("function");
  });

  it("matches fast-check's returned-false wording", () => {
    // Live pin: if a fast-check upgrade rewords its synthesized error,
    // this fails loudly here instead of silently reclassifying every
    // falsified property as `threw` in runtime.ts.
    const out = fc.check(fc.property(fc.boolean(), () => false));
    expect(out.failed).toBe(true);
    expect((out.errorInstance as Error).message).toBe(
      FC_PROPERTY_FAILED_MESSAGE,
    );
  });

  it("pins the qualified-name pattern", () => {
    expect(QUALIFIED_NAME_PATTERN.source).toBe(
      "^[A-Za-z_][A-Za-z0-9_]*([#.][A-Za-z_][A-Za-z0-9_]*)?$",
    );
    expect(QUALIFIED_NAME_PATTERN.flags).toBe("");
  });

  it("accepts everything qualifiedName produces", () => {
    const identifier = fc.stringMatching(/^[A-Za-z_][A-Za-z0-9_]*$/);
    fc.assert(
      fc.property(
        identifier,
        fc.option(identifier, { nil: undefined }),
        fc.boolean(),
        (fn, cls, isStatic) =>
          QUALIFIED_NAME_PATTERN.test(qualifiedName(fn, cls, isStatic)),
      ),
    );
  });

  it("every schema-valid issue is assignable to Issue (compile-time)", () => {
    // One-way guard: the strict zod union may only ever narrow the loose
    // Issue interface, never diverge from it. Fails to COMPILE on drift.
    const check: Issue = null as unknown as z.infer<typeof IssueSchema>;
    expect(check).toBeNull();
  });
});
