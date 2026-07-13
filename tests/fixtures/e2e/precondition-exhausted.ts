/** Demonstrates the `exhausted` outcome. The top-level `==>` becomes an
 * fc.pre(...) precondition; 525600 is a non-boundary value that fc.nat()
 * essentially never generates, so every run is skipped and fast-check gives
 * up — the reporter maps the null counterexample to kind "exhausted".
 *
 * @ensures{unsatisfiable} forall (x: nat) { x === 525600 ==> alwaysTrue(x) }
 */
export function alwaysTrue(x: number): boolean {
  return x === x;
}
