import { describe, it, expect } from "vitest";
import { isTsSource, discoverFiles } from "../src/discover.js";
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

describe("discoverFiles: src/ convention", () => {
  useTempProject("pabst-disc-src-", {
    "src/a.ts": "export const a = 1;\n",
    "src/nested/b.mts": "export const b = 2;\n",
    "src/types.d.ts": "export declare const a: number;\n",
    "scripts/ignored.ts": "export const c = 3;\n",
  });

  it("finds sources under src/, skipping declarations and other dirs", () => {
    expect(discoverFiles()).toEqual({
      files: ["src/a.ts", "src/nested/b.mts"],
      source: "src/",
    });
  });
});

describe("discoverFiles: src/ holding only declaration files", () => {
  useTempProject("pabst-disc-decl-", {
    "src/types.d.ts": "export declare const a: number;\n",
  });

  it("throws PabstError rather than reporting zero files", () => {
    expect(() => discoverFiles()).toThrow(PabstError);
  });
});

describe("discoverFiles: nothing to go on", () => {
  useTempProject("pabst-disc-none-", {
    "readme.md": "hi\n",
    "loose.ts": "export const x = 1;\n",
  });

  it("throws PabstError suggesting a glob (root-level .ts does not count)", () => {
    expect(() => discoverFiles()).toThrow(PabstError);
    expect(() => discoverFiles()).toThrow(
      /cannot determine where your source code is/,
    );
  });
});

describe("discoverFiles: tsconfig.json", () => {
  useTempProject("pabst-disc-tsc-", {
    "tsconfig.json": JSON.stringify({ include: ["lib"] }),
    "lib/a.ts": "export const a = 1;\n",
    "lib/types.d.ts": "export declare const a: number;\n",
    "src/decoy.ts": "export const s = 1;\n",
  });

  it("uses the tsconfig file list (declarations dropped), not src/", () => {
    expect(discoverFiles()).toEqual({
      files: ["lib/a.ts"],
      source: "tsconfig.json",
    });
  });
});

describe("discoverFiles: exclude is honored", () => {
  useTempProject("pabst-disc-excl-", {
    "tsconfig.json": JSON.stringify({
      include: ["src"],
      exclude: ["src/legacy"],
    }),
    "src/a.ts": "export const a = 1;\n",
    "src/legacy/old.ts": "export const o = 1;\n",
  });

  it("omits excluded files", () => {
    expect(discoverFiles().files).toEqual(["src/a.ts"]);
  });
});

describe("discoverFiles: solution-style tsconfig", () => {
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
    expect(discoverFiles()).toEqual({
      files: ["src/a.ts"],
      source: "src/",
    });
  });
});

describe("discoverFiles: tsconfig matching nothing, no src/", () => {
  useTempProject("pabst-disc-empty-", {
    "tsconfig.json": JSON.stringify({ include: ["nope"] }),
  });

  it("throws the no-sources PabstError (18003 is not an error)", () => {
    expect(() => discoverFiles()).toThrow(
      /cannot determine where your source code is/,
    );
  });
});

describe("discoverFiles: malformed tsconfig JSON", () => {
  useTempProject("pabst-disc-garbage-", {
    "tsconfig.json": "{ not json",
    "src/a.ts": "export const a = 1;\n",
  });

  it("throws PabstError naming tsconfig.json, not falling through", () => {
    expect(() => discoverFiles()).toThrow(PabstError);
    expect(() => discoverFiles()).toThrow(/^tsconfig\.json:/);
  });
});

describe("discoverFiles: unresolvable extends", () => {
  useTempProject("pabst-disc-extends-", {
    "tsconfig.json": JSON.stringify({ extends: "./missing.json" }),
    "src/a.ts": "export const a = 1;\n",
  });

  it("throws PabstError naming tsconfig.json, not falling through", () => {
    expect(() => discoverFiles()).toThrow(/^tsconfig\.json:/);
  });
});
