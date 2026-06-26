import { stringify } from "fast-check";

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
 * Reporter used by generated property tests. fast-check invokes a custom
 * reporter *instead of* its default throw, so this is solely responsible for
 * failing the test — it must throw on `d.failed`. It binds the positional
 * counterexample back to the binder names and drops fast-check's seed/shrink
 * noise. A failure caused by a thrown exception (errorInstance set to something
 * other than the returning-false sentinel) gets that message appended.
 */
export function report(name: string, varNames: string[], d: ReportDetails): void {
  if (!d.failed) return;
  if (d.counterexample === null) {
    throw new Error(`property '${name}' failed: ` + (d.errorInstance?.message ?? "too many skipped runs"));
  }
  const args = varNames.map((n, i) => `${n} = ${stringify(d.counterexample![i])}`).join(", ");
  const err = d.errorInstance;
  const threw = err && err.message !== "Property failed by returning false";
  throw new Error(`property '${name}' falsified by ${args}` + (threw ? `\n  ${err.message}` : ""));
}
