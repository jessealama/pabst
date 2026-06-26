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

const ISSUE_RE = /PABST_ISSUE:(\{.*\})/;

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
