/** Every generated value must land inside the declared interval: the body
 * re-checks the bounds, so any out-of-range value falsifies the property.
 *
 * @ensures{staysInRange} forall (n: int ∈ [1, 30]), intInRange(n)
 */
export function intInRange(n: number): boolean {
  return n >= 1 && n <= 30;
}

/** NaN fails both comparisons, so this also proves the generated arbitrary
 * carries noNaN: true.
 *
 * @ensures{unitInterval} forall (x: number ∈ [0, 1]), numberInUnit(x)
 */
export function numberInUnit(x: number): boolean {
  return x >= 0 && x <= 1;
}

/** Exercises the ASCII `in` fallback and n-suffixed endpoints end-to-end.
 *
 * @ensures{bigintBounds} forall (b: bigint in [0n, 100n]), bigintInRange(b)
 */
export function bigintInRange(b: bigint): boolean {
  return b >= 0n && b <= 100n;
}
