import { describe, it, expect, beforeAll } from "vitest";
import * as path from "node:path";
import { isTsSource, resolveFiles } from "../src/discover.js";
import { PabstError } from "../src/errors.js";
import { useTempProject } from "./helpers/cli.js";

describe("isTsSource", () => {
  it.each(["a.ts", "a.tsx", "a.mts", "a.cts", "src/deep/a.ts"])(
    "accepts %s",
    (f) => {
      expect(isTsSource(f)).toBe(true);
    },
  );

  it.each(["a.d.ts", "a.d.mts", "a.d.cts", "a.js", "a.json", "a.md", "src"])(
    "rejects %s",
    (f) => {
      expect(isTsSource(f)).toBe(false);
    },
  );
});

describe("zero-arg discovery: src/ convention", () => {
  useTempProject("pabst-disc-src-", {
    "src/a.ts": "export const a = 1;\n",
    "src/nested/b.mts": "export const b = 2;\n",
    "src/types.d.ts": "export declare const a: number;\n",
    "scripts/ignored.ts": "export const c = 3;\n",
  });

  it("finds sources under src/, skipping declarations and other dirs", () => {
    expect(resolveFiles([])).toEqual({
      files: ["src/a.ts", "src/nested/b.mts"],
      source: "src/",
    });
  });
});

describe("zero-arg discovery: src/ holding only declaration files", () => {
  useTempProject("pabst-disc-decl-", {
    "src/types.d.ts": "export declare const a: number;\n",
  });

  it("throws PabstError rather than reporting zero files", () => {
    expect(() => resolveFiles([])).toThrow(PabstError);
  });
});

describe("zero-arg discovery: nothing to go on", () => {
  useTempProject("pabst-disc-none-", {
    "readme.md": "hi\n",
    "loose.ts": "export const x = 1;\n",
  });

  it("throws PabstError suggesting a glob (root-level .ts does not count)", () => {
    expect(() => resolveFiles([])).toThrow(PabstError);
    expect(() => resolveFiles([])).toThrow(
      /cannot determine where your source code is/,
    );
  });
});

describe("zero-arg discovery: tsconfig.json", () => {
  useTempProject("pabst-disc-tsc-", {
    "tsconfig.json": JSON.stringify({ include: ["lib"] }),
    "lib/a.ts": "export const a = 1;\n",
    "lib/types.d.ts": "export declare const a: number;\n",
    "src/decoy.ts": "export const s = 1;\n",
  });

  it("uses the tsconfig file list (declarations dropped), not src/", () => {
    expect(resolveFiles([])).toEqual({
      files: ["lib/a.ts"],
      source: "tsconfig.json",
    });
  });
});

describe("zero-arg discovery: exclude is honored", () => {
  useTempProject("pabst-disc-excl-", {
    "tsconfig.json": JSON.stringify({
      include: ["src"],
      exclude: ["src/legacy"],
    }),
    "src/a.ts": "export const a = 1;\n",
    "src/legacy/old.ts": "export const o = 1;\n",
  });

  it("omits excluded files", () => {
    expect(resolveFiles([]).files).toEqual(["src/a.ts"]);
  });
});

describe("zero-arg discovery: solution-style tsconfig", () => {
  useTempProject("pabst-disc-solution-", {
    "tsconfig.json": JSON.stringify({
      files: [],
      references: [{ path: "./packages/a" }],
    }),
    "packages/a/tsconfig.json": "{}",
    "packages/a/a.ts": "export const a = 1;\n",
    "src/a.ts": "export const a = 1;\n",
  });

  it("resolves to zero files and falls through to src/", () => {
    expect(resolveFiles([])).toEqual({
      files: ["src/a.ts"],
      source: "src/",
    });
  });
});

describe("zero-arg discovery: editor-only tsconfig (files: [])", () => {
  useTempProject("pabst-disc-files-empty-", {
    "tsconfig.json": JSON.stringify({ files: [] }),
    "src/a.ts": "export const a = 1;\n",
  });

  it("treats TS18002 as 'no inputs here' and falls through to src/", () => {
    expect(resolveFiles([])).toEqual({
      files: ["src/a.ts"],
      source: "src/",
    });
  });
});

describe("zero-arg discovery: tsconfig with an unknown compiler option", () => {
  useTempProject("pabst-disc-skew-", {
    "tsconfig.json": JSON.stringify({
      compilerOptions: { someFutureFlag: true },
      include: ["lib"],
    }),
    "lib/a.ts": "export const a = 1;\n",
  });

  it("ignores compiler-option diagnostics and uses the file list", () => {
    expect(resolveFiles([])).toEqual({
      files: ["lib/a.ts"],
      source: "tsconfig.json",
    });
  });
});

describe("zero-arg discovery: tsconfig with a bad compiler-option value", () => {
  useTempProject("pabst-disc-badval-", {
    "tsconfig.json": JSON.stringify({
      compilerOptions: { target: "es2099", strict: "yes" },
      include: ["lib"],
    }),
    "lib/a.ts": "export const a = 1;\n",
  });

  it("ignores compiler-option diagnostics and uses the file list", () => {
    expect(resolveFiles([])).toEqual({
      files: ["lib/a.ts"],
      source: "tsconfig.json",
    });
  });
});

describe("zero-arg discovery: tsconfig reaching outside the project", () => {
  const dir = useTempProject("pabst-disc-outside-", {
    "pkg/tsconfig.json": JSON.stringify({ include: ["src", "../shared"] }),
    "pkg/src/a.ts": "export const a = 1;\n",
    "shared/b.ts": "export const b = 1;\n",
  });
  // useTempProject's beforeAll has already chdir'd to dir; go one deeper so
  // ../shared resolves outside the cwd. Its afterAll restores the repo root.
  beforeAll(() => process.chdir(path.join(dir, "pkg")));

  it("keeps only files inside the current directory", () => {
    expect(resolveFiles([])).toEqual({
      files: [path.join("src", "a.ts")],
      source: "tsconfig.json",
    });
  });
});

describe("zero-arg discovery: tsconfig files entry that does not exist", () => {
  useTempProject("pabst-disc-stale-", {
    "tsconfig.json": JSON.stringify({
      files: ["src/removed.ts", "src/a.ts"],
    }),
    "src/a.ts": "export const a = 1;\n",
  });

  it("throws PabstError naming the missing file, not crashing downstream", () => {
    expect(() => resolveFiles([])).toThrow(PabstError);
    expect(() => resolveFiles([])).toThrow(
      /^tsconfig\.json: file not found: src\/removed\.ts$/,
    );
  });
});

describe("zero-arg discovery: misspelled root option (excludes)", () => {
  useTempProject("pabst-disc-rootopt-", {
    "tsconfig.json": JSON.stringify({
      include: ["lib"],
      excludes: ["lib/legacy"],
    }),
    "lib/a.ts": "export const a = 1;\n",
    "lib/legacy/old.ts": "export const o = 1;\n",
  });

  it("stays fatal: the typo makes the file list differ from user intent", () => {
    expect(() => resolveFiles([])).toThrow(/^tsconfig\.json:/);
  });
});

describe("zero-arg discovery: tsconfig matching nothing, no src/", () => {
  useTempProject("pabst-disc-empty-", {
    "tsconfig.json": JSON.stringify({ include: ["nope"] }),
  });

  it("throws the no-sources PabstError (18003 is not an error)", () => {
    expect(() => resolveFiles([])).toThrow(
      /cannot determine where your source code is/,
    );
  });
});

describe("zero-arg discovery: malformed tsconfig JSON", () => {
  useTempProject("pabst-disc-garbage-", {
    "tsconfig.json": "{ not json",
    "src/a.ts": "export const a = 1;\n",
  });

  it("throws PabstError naming tsconfig.json, not falling through", () => {
    expect(() => resolveFiles([])).toThrow(PabstError);
    expect(() => resolveFiles([])).toThrow(/^tsconfig\.json:/);
  });
});

describe("resolveFiles: explicit patterns", () => {
  useTempProject("pabst-disc-patterns-", {
    "a.ts": "export const a = 1;\n",
    "a.d.ts": "export declare const a: number;\n",
    "b.d.ts": "export declare const b: number;\n",
  });

  it("drops declaration matches of an ordinary pattern", () => {
    expect(resolveFiles(["*.ts"])).toEqual({
      files: ["a.ts"],
      source: "arguments",
    });
  });

  it("honors a pattern that itself names declaration files", () => {
    expect(resolveFiles(["*.d.ts"]).files.sort()).toEqual(["a.d.ts", "b.d.ts"]);
  });

  it("dedupes across overlapping patterns", () => {
    expect(resolveFiles(["a.ts", "*.ts"]).files).toEqual(["a.ts"]);
  });

  it("throws PabstError when nothing matches", () => {
    expect(() => resolveFiles(["*.nope"])).toThrow(PabstError);
    expect(() => resolveFiles(["*.nope"])).toThrow(/^no matching \.ts files$/);
  });
});

describe("zero-arg discovery: unresolvable extends", () => {
  useTempProject("pabst-disc-extends-", {
    "tsconfig.json": JSON.stringify({ extends: "./missing.json" }),
    "src/a.ts": "export const a = 1;\n",
  });

  it("throws PabstError naming tsconfig.json, not falling through", () => {
    expect(() => resolveFiles([])).toThrow(/^tsconfig\.json:/);
  });
});
