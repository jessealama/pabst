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

/**
 * Module specifier generated tests import the runtime from. Must match
 * package.json's `name` + `exports` map (pinned by a test).
 */
export const RUNTIME_SPECIFIER = "pabst-checker/runtime";

/** Names the runtime module exports (pinned against src/runtime.ts by a test). */
export const BOOL_EXPORT = "bool";
export const REPORT_EXPORT = "report";

/** Aliases those exports are bound to inside generated test files. */
export const BOOL_ALIAS = "__bool";
export const REPORT_ALIAS = "__pabstReport";

/**
 * The exact message fast-check puts on the error it synthesizes when a
 * property returns false (as opposed to throwing). The runtime's
 * falsified-vs-threw classification string-matches this because RunDetails
 * carries no discriminator field — fast-check knows which case occurred and
 * erases it into this prose. The principled fix is upstream: a `failureKind`
 * field on RunDetails. Until then, a live pin test fails loudly if a
 * fast-check upgrade rewords it.
 */
export const FC_PROPERTY_FAILED_MESSAGE = "Property failed by returning false";

export const ISSUE_SENTINEL = "PABST_ISSUE:";

const ISSUE_RE = new RegExp(`${ISSUE_SENTINEL}(\\{.*\\})`);

/** Encode an issue for the wire: sentinel + single-line JSON, carried on an Error message. */
export function encodeIssue(issue: Issue): string {
  return ISSUE_SENTINEL + JSON.stringify(issue);
}

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
