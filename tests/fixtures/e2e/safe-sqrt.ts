/** Demonstrates the `threw` outcome: the property body raises an exception
 * (rather than returning false) for some generated input. `int` readily
 * produces negatives, so the RangeError path is exercised.
 *
 * @ensures{nonNegativeRoot} forall (x: int), safeSqrt(x) >= 0
 */
export function safeSqrt(x: number): number {
  if (x < 0) throw new RangeError("negative input");
  return Math.sqrt(x);
}
