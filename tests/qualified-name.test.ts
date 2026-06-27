import { describe, it, expect } from "vitest";
import { qualifiedName } from "../src/qualified-name.js";

describe("qualifiedName", () => {
  it("returns the bare name for a free function", () => {
    expect(qualifiedName("add")).toBe("add");
  });

  it("uses # for an instance method", () => {
    expect(qualifiedName("inc", "Counter", false)).toBe("Counter#inc");
  });

  it("uses . for a static method", () => {
    expect(qualifiedName("of", "Counter", true)).toBe("Counter.of");
  });
});
