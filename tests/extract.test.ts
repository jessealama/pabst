import { describe, it, expect } from "vitest";
import { extract } from "../src/extract.js";

const FIXTURE = new URL("./fixtures/foo.ts", import.meta.url).pathname;

describe("extract", () => {
  it("reads exported names", () => {
    const r = extract(FIXTURE);
    expect([...r.exports].sort()).toEqual(["foo", "helper"]);
  });

  it("reads the @ensures annotation attached to its function", () => {
    const r = extract(FIXTURE);
    expect(r.annotations).toHaveLength(1);
    const a = r.annotations[0]!;
    expect(a.propertyName).toBe("nonzero");
    expect(a.functionName).toBe("foo");
    expect(a.formula).toContain("forall (x: int) (y: number)");
    expect(a.formula).toContain("foo(x, y) !== 0");
    expect(a.line).toBeGreaterThan(0);
  });
});
