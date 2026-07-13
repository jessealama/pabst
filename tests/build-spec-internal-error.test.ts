import { describe, it, expect, vi } from "vitest";
import { runMain, useTempProject } from "./helpers/cli.js";

// The per-annotation catch in build-spec wraps only PabstError in the
// `file:line: @ensures{name}:` diagnostic; anything else must be rethrown
// as-is so internal compile-pipeline bugs crash loudly instead of being
// reported as user errors. The cli-internal-error suite mocks the generator
// wholesale and never reaches that catch, so simulate a bug deep inside the
// pipeline — lowerTop throws after buildSpec's try block has been entered —
// and check the TypeError escapes main() unwrapped.
vi.mock("../src/lower.js", () => ({
  lowerTop: () => {
    throw new TypeError("internal invariant violated in lowering");
  },
}));

describe("build-spec internal errors", () => {
  useTempProject("pabst-buildspec-internal-", {
    "fine.ts": `/** @ensures{pos} forall (n: nat) { fine(n) >= 0 } */\nexport function fine(n: number): number { return n; }\n`,
  });

  it("a non-PabstError thrown mid-annotation escapes main() unwrapped", () => {
    expect(() => runMain(["test", "fine.ts"])).toThrow(TypeError);
    expect(() => runMain(["test", "fine.ts"])).toThrow(
      /internal invariant violated in lowering/,
    );
  });
});
