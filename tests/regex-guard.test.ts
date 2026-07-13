import { describe, it, expect } from "vitest";
import {
  anchoredSource,
  parseRegexGuard,
  scanRegexLiteral,
} from "../src/regex-guard.js";
import { expectPabstError } from "./helpers/errors.js";

describe("scanRegexLiteral", () => {
  it("scans a literal and its flags, stopping at the next non-letter", () => {
    expect(scanRegexLiteral("/abc/u rest", 0)).toBe(6);
  });

  it("does not close on a slash inside a character class", () => {
    expect(scanRegexLiteral("/[/]a/", 0)).toBe(6);
  });

  it("does not close on an escaped slash", () => {
    expect(scanRegexLiteral("/a\\/b/", 0)).toBe(6);
  });

  it("ignores parentheses inside character classes", () => {
    expect(scanRegexLiteral("/[(]/)", 0)).toBe(5);
  });

  it("returns text.length for an unterminated literal", () => {
    expect(scanRegexLiteral("/[a-z]", 0)).toBe(6);
  });

  it("scans from a non-zero start", () => {
    expect(scanRegexLiteral("xx /a/u", 3)).toBe(7);
  });
});

describe("parseRegexGuard — accepted", () => {
  it("keeps source and flags verbatim", () => {
    expect(parseRegexGuard("/^[a-z]+$/", "string")).toEqual({
      source: "^[a-z]+$",
      flags: "",
    });
    expect(parseRegexGuard("/\\p{Lu}+/u", "string")).toEqual({
      source: "\\p{Lu}+",
      flags: "u",
    });
    expect(parseRegexGuard("/a.b/s", "string")).toEqual({
      source: "a.b",
      flags: "s",
    });
  });

  it("accepts user-written anchors (harmless under auto-anchoring)", () => {
    expect(parseRegexGuard("/^$/", "string")).toEqual({
      source: "^$",
      flags: "",
    });
    expect(parseRegexGuard("/^a$|^bb$/", "string")).toEqual({
      source: "^a$|^bb$",
      flags: "",
    });
  });

  it("accepts slashes and parens inside character classes", () => {
    expect(parseRegexGuard("/[(]a[/]/", "string")).toEqual({
      source: "[(]a[/]",
      flags: "",
    });
  });
});

describe("parseRegexGuard — rejected", () => {
  it("rejects non-string domains", () => {
    expectPabstError(() => parseRegexGuard("/a/", "int"), /only string/);
    expectPabstError(() => parseRegexGuard("/a/", "number"), /only string/);
    expectPabstError(() => parseRegexGuard("/a/", "boolean"), /only string/);
  });

  it("rejects an unterminated literal with the JSDoc-truncation hint", () => {
    expectPabstError(
      () => parseRegexGuard("/[a-z]", "string"),
      /ends the enclosing JSDoc comment/,
    );
  });

  it("treats a newline as terminating the literal (as JS does)", () => {
    expectPabstError(
      () => parseRegexGuard("/a\nb/", "string"),
      /unterminated regular expression/,
    );
  });

  it("rejects trailing text after the literal", () => {
    expectPabstError(
      () => parseRegexGuard("/a/ x", "string"),
      /unexpected text after regular expression/,
    );
  });

  it("rejects an empty pattern with a hint", () => {
    expectPabstError(() => parseRegexGuard("//", "string"), "use ∈ /^$/");
  });

  it("rejects flags outside the allowlist with tailored hints", () => {
    expectPabstError(() => parseRegexGuard("/a/m", "string"), /whole string/);
    expectPabstError(
      () => parseRegexGuard("/a/i", "string"),
      /not supported by fast-check/,
    );
    expectPabstError(
      () => parseRegexGuard("/a/v", "string"),
      /not supported by fast-check/,
    );
    expectPabstError(
      () => parseRegexGuard("/a/g", "string"),
      /no effect on generation/,
    );
    expectPabstError(
      () => parseRegexGuard("/a/y", "string"),
      /no effect on generation/,
    );
    expectPabstError(
      () => parseRegexGuard("/a/d", "string"),
      /no effect on generation/,
    );
    expectPabstError(
      () => parseRegexGuard("/a/x", "string"),
      /allowed flags: s, u/,
    );
  });

  it("rejects invalid regexes via the RegExp constructor", () => {
    expectPabstError(
      () => parseRegexGuard("/a)b/", "string"),
      /invalid regular expression/,
    );
    expectPabstError(
      () => parseRegexGuard("/a/ss", "string"),
      /invalid regular expression/,
    );
  });

  it("rejects constructs outside fast-check's supported subset", () => {
    expectPabstError(
      () => parseRegexGuard("/(?=a)b/", "string"),
      /not supported by fast-check/,
    );
    expectPabstError(
      () => parseRegexGuard("/\\bx/", "string"),
      /not supported by fast-check/,
    );
    expectPabstError(
      () => parseRegexGuard("/(a)\\1/", "string"),
      /not supported by fast-check/,
    );
  });
});

describe("anchoredSource", () => {
  it("wraps the pattern in a full-string non-capturing group", () => {
    expect(anchoredSource("[a-z]+")).toBe("^(?:[a-z]+)$");
  });
});
