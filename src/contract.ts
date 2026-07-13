/**
 * The generated-code contract: every spelling that must agree across the
 * seam between emitted test code, the runtime it imports, and the issue
 * wire format the CLI parses back out of vitest. Each value here is either
 * written into generated output or used to decode it — the two sides of
 * each seam import this module instead of spelling the string twice.
 */

export type IssueKind = "falsified" | "threw" | "exhausted";

export interface Issue {
  file: string;
  function: string;
  property: string;
  kind: IssueKind;
  counterexample?: Record<string, unknown>;
  error?: string;
}

export interface Envelope {
  version: string;
  startedAt: string;
  cwd: string;
  seed: number;
  generated: number;
  passed: number;
  failed: number;
  issues: Issue[];
}

export const ISSUE_SENTINEL = "PABST_ISSUE:";

const ISSUE_RE = new RegExp(`${ISSUE_SENTINEL}(\\{.*\\})`);

/**
 * Extract a pabst Issue from a vitest failure message, or null if the message
 * carries no tagged payload. The payload is single-line JSON, so a stack trace
 * on following lines is ignored.
 */
export function parseIssue(failureMessage: string): Issue | null {
  const m = ISSUE_RE.exec(failureMessage);
  if (!m) return null;
  try {
    return JSON.parse(m[1]!) as Issue;
  } catch {
    return null;
  }
}
