import { beforeAll, afterAll, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { main } from "../../src/cli.js";

export interface MainRun {
  code: number;
  stdout: string[];
  stderr: string[];
}

/**
 * Run the CLI's main() with both console streams captured, so tests can
 * assert on diagnostics regardless of which stream they land on.
 */
export function runMain(argv: string[]): MainRun {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation((s) => {
    stdout.push(String(s));
  });
  const errSpy = vi.spyOn(console, "error").mockImplementation((s) => {
    stderr.push(String(s));
  });
  try {
    return { code: main(argv), stdout, stderr };
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
  }
}

/**
 * Create a temp directory populated with `files` and chdir into it for the
 * duration of the enclosing describe block (registers beforeAll/afterAll).
 * Returns the directory path.
 */
export function useTempProject(
  prefix: string,
  files: Record<string, string>,
): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const prevCwd = process.cwd();
  beforeAll(() => {
    for (const [name, text] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, name), text, "utf8");
    }
    process.chdir(dir);
  });
  afterAll(() => {
    process.chdir(prevCwd);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  return dir;
}
