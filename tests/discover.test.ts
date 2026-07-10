import { describe, it, expect } from "vitest";
import { isTsSource } from "../src/discover.js";

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
