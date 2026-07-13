/** Equation syntax: `≡` is Object.is. The `≢` / `¬(… ≡ …)` guards discard
 * -0, where `x + 0` yields +0 and the identity would otherwise be refuted. */

/** @ensures{identity} forall (x: number) { x ≢ -0 -> addZero(x) ≡ x } */
export function addZero(x: number): number {
  return x + 0;
}

/** @ensures{involution} forall (x: number) { ¬(x ≡ -0) -> negateTwice(x) ≡ x } */
export function negateTwice(x: number): number {
  return -(-x);
}

/** @ensures{asciiSpelling} forall (x: number) { Object.is(double(x), x + x) } */
export function double(x: number): number {
  return x + x;
}
