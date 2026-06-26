/**
 * Compact rendering of vitest's JSON reporter output. The pabst CLI runs the
 * generated tests with `--reporter=json` and feeds the parsed result here so it
 * can print a terse summary instead of vitest's full tree + banners + stacks.
 */

export interface AssertionResult {
  status: string;
  title: string;
  ancestorTitles: string[];
  failureMessages: string[];
}

export interface FileResult {
  assertionResults: AssertionResult[];
}

export interface VitestJson {
  numPassedTests: number;
  numFailedTests: number;
  success: boolean;
  testResults: FileResult[];
}

const SEED_SUFFIX = / \(with seed=-?\d+\)$/;

/**
 * Strip the stack trace and the leading "Error: " from a vitest failure
 * message, leaving just the reporter's message (which may itself span multiple
 * lines, e.g. an appended thrown-exception message).
 */
export function cleanFailure(raw: string): string {
  const beforeStack = raw.split(/\n\s+at /)[0] ?? raw;
  return beforeStack.replace(/^Error:\s*/, "");
}

/** Render a parsed vitest JSON run as a compact, pabst-flavoured summary. */
export function formatRun(json: VitestJson): string {
  const pass = json.numPassedTests;
  const fail = json.numFailedTests;
  const lines: string[] = [];

  if (fail === 0) {
    lines.push(`pabst: ${pass} passed`);
    return lines.join("\n");
  }

  lines.push(`pabst: ${fail} failed, ${pass} passed`);
  lines.push("");
  for (const file of json.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      if (a.status !== "failed") continue;
      const path = [...a.ancestorTitles.filter((t) => t !== "pabst"), a.title.replace(SEED_SUFFIX, "")].join(" › ");
      lines.push(`  ✗ ${path}`);
      const msg = cleanFailure(a.failureMessages[0] ?? "(no failure message)");
      for (const ml of msg.split("\n")) lines.push(`    ${ml}`);
    }
  }
  return lines.join("\n");
}
