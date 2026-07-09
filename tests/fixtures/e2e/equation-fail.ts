/** The same -0 near-miss as near-miss.ts, written with equation syntax:
 * `negate(0)` is -0 while `0 - 0` is +0, and Object.is(-0, +0) is false. */

/** @ensures{matchesSubtraction} forall (x: number), negate(x) = 0 - x */
export function negate(x: number): number {
  return -x;
}
