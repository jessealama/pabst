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
