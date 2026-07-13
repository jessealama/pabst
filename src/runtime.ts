import { stringify } from "fast-check";
import {
  encodeIssue,
  FC_PROPERTY_FAILED_MESSAGE,
  type Issue,
} from "./contract.js";

/**
 * The subset of fast-check's RunDetails that the reporter consumes. The
 * counterexample is the tuple of generated arguments, in binder order.
 */
export interface ReportDetails {
  failed: boolean;
  counterexample: unknown[] | null;
  errorInstance?: { message?: string } | null;
}

/**
 * Encode a single counterexample value for JSON output: finite numbers,
 * booleans, and strings round-trip as native JSON; everything else (bigint,
 * NaN/Infinity, objects) becomes its lossless fast-check stringify() form.
 */
function encodeValue(v: unknown): unknown {
  if (typeof v === "string" || typeof v === "boolean") return v;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return stringify(v);
}

function throwIssue(issue: Issue): never {
  throw new Error(encodeIssue(issue));
}

/**
 * Assert that a property atom evaluated to a genuine boolean (no truthiness
 * coercion), returning it so it composes inside lowered boolean expressions.
 * Throwing here surfaces as a `threw` issue whose message names the atom.
 */
export function bool(v: unknown, expr: string): boolean {
  if (v !== true && v !== false) {
    const shown =
      typeof v === "string"
        ? JSON.stringify(v)
        : typeof v === "bigint"
          ? `${v}n`
          : String(v);
    throw new Error(
      `atom ${JSON.stringify(expr)} evaluated to ${shown}, not a boolean`,
    );
  }
  return v;
}

/**
 * Reporter used by generated property tests. fast-check invokes this instead of
 * its default throw, so it is solely responsible for failing the test — it must
 * throw on `d.failed`. On failure it throws an Error whose message is a
 * sentinel-tagged JSON Issue that the CLI parses back out of vitest's reporter
 * output.
 */
export function report(
  file: string,
  functionName: string,
  name: string,
  varNames: string[],
  d: ReportDetails,
): void {
  if (!d.failed) return;
  const base = { file, function: functionName, property: name };

  if (d.counterexample === null) {
    throwIssue({
      ...base,
      kind: "exhausted",
      error: d.errorInstance?.message ?? "too many skipped runs",
    });
  }

  const counterexample: Record<string, unknown> = {};
  varNames.forEach((n, i) => {
    counterexample[n] = encodeValue(d.counterexample![i]);
  });

  const err = d.errorInstance;
  const threw = !!err && err.message !== FC_PROPERTY_FAILED_MESSAGE;
  if (threw) {
    throwIssue({ ...base, kind: "threw", counterexample, error: err!.message });
  }
  throwIssue({ ...base, kind: "falsified", counterexample });
}
