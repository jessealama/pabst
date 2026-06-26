import { parseIssue, type Issue, type Envelope } from "./issue.js";

/** The subset of vitest's JSON reporter output the envelope consumes. */
export interface AssertionResult {
  status: string;
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

/** Run-level metadata the CLI captures, independent of the vitest run. */
export interface RunMeta {
  version: string;
  startedAt: string;
  cwd: string;
  seed: number;
  generated: number;
}

/** Parse every failed assertion's tagged payload into an Issue. */
export function collectIssues(json: VitestJson): Issue[] {
  const issues: Issue[] = [];
  for (const file of json.testResults ?? []) {
    for (const a of file.assertionResults ?? []) {
      if (a.status !== "failed") continue;
      const issue = parseIssue(a.failureMessages[0] ?? "");
      if (issue) issues.push(issue);
    }
  }
  return issues;
}

/** Assemble the full run envelope from metadata and a parsed vitest run. */
export function buildEnvelope(meta: RunMeta, json: VitestJson): Envelope {
  return {
    version: meta.version,
    startedAt: meta.startedAt,
    cwd: meta.cwd,
    seed: meta.seed,
    generated: meta.generated,
    passed: json.numPassedTests,
    failed: json.numFailedTests,
    issues: collectIssues(json),
  };
}
