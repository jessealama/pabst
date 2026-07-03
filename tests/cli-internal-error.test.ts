import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { main } from "../src/cli.js";

// Issue #12: only user-facing compile errors map to exit 2. An internal bug
// (anything that is not a PabstError) must keep crashing loudly rather than
// being dressed up as a usage error. A real internal bug can't be triggered
// on purpose, so simulate one by making the generator throw a TypeError.
vi.mock("../src/codegen.js", () => ({
  generate: () => {
    throw new TypeError("internal invariant violated");
  },
}));

describe("cli internal errors", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pabst-cli-internal-"));
  const prevCwd = process.cwd();

  beforeAll(() => {
    fs.writeFileSync(
      path.join(dir, "fine.ts"),
      `/** @ensures{pos} forall (n: nat), fine(n) >= 0 */\nexport function fine(n: number): number { return n; }\n`,
      "utf8",
    );
    process.chdir(dir);
  });
  afterAll(() => {
    process.chdir(prevCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("a non-PabstError from compilation escapes main() instead of exiting 2", () => {
    expect(() => main(["test", "fine.ts"])).toThrow(TypeError);
  });
});
