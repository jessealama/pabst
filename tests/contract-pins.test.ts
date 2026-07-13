import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  BOOL_EXPORT,
  FC_PROPERTY_FAILED_MESSAGE,
  REPORT_EXPORT,
  RUNTIME_SPECIFIER,
} from "../src/contract.js";
import {
  QUALIFIED_NAME_PATTERN,
  qualifiedName,
} from "../src/qualified-name.js";
import * as runtime from "../src/runtime.js";

describe("contract pins", () => {
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

  it("keeps the schema's functionName pattern in sync with the builder's", () => {
    const schema = JSON.parse(
      readFileSync(
        new URL("../schemas/issue.schema.json", import.meta.url),
        "utf8",
      ),
    );
    expect(schema.definitions.functionName.pattern).toBe(
      QUALIFIED_NAME_PATTERN.source,
    );
    // The schema embeds the bare source, so the RegExp must carry no flags
    // that would make it mean something different in place.
    expect(QUALIFIED_NAME_PATTERN.flags).toBe("");
  });

  it("accepts everything qualifiedName produces from ASCII identifiers", () => {
    // Bounded guarantee: segments drawn from ASCII TypeScript identifiers
    // (including $). Unicode identifiers are legal TS but outside the
    // pattern — the documented gap in qualified-name.ts.
    const identifier = fc.stringMatching(/^[$A-Za-z_][$A-Za-z0-9_]*$/);
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
});
