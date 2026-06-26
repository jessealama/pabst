import { describe, it, expect } from "vitest";
import { buildSpecs } from "../src/build-spec.js";

const FIXTURE = new URL("./fixtures/foo.ts", import.meta.url).pathname;

describe("buildSpecs", () => {
  it("produces a PropertySpec for the worked example", () => {
    const specs = buildSpecs(FIXTURE);
    expect(specs).toHaveLength(1);
    const s = specs[0]!;
    expect(s.name).toBe("nonzero");
    expect(s.functionName).toBe("foo");
    expect(s.binders).toEqual([
      { varName: "x", domain: "int" },
      { varName: "y", domain: "number" },
    ]);
    expect(s.preconditions).toEqual(["Math.isInteger(y)"]);
    expect(s.body).toBe("foo(x, y) !== 0");
    expect(s.freeExports).toEqual(["foo"]);
    expect(s.location.line).toBeGreaterThan(0);
  });
});
