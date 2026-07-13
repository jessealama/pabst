/** Every generated value must land inside the declared interval: the body
 * re-checks the bounds, so any out-of-range value falsifies the property.
 *
 * @ensures{staysInRange} forall (n: int ∈ [1, 30]) { intInRange(n) }
 */
export function intInRange(n: number): boolean {
  return n >= 1 && n <= 30;
}

/** NaN fails both comparisons, so this also proves the generated arbitrary
 * carries noNaN: true.
 *
 * @ensures{unitInterval} forall (x: number ∈ [0, 1]) { numberInUnit(x) }
 */
export function numberInUnit(x: number): boolean {
  return x >= 0 && x <= 1;
}

/** Exercises the ASCII `in` fallback and n-suffixed endpoints end-to-end.
 *
 * @ensures{bigintBounds} forall (b: bigint in [0n, 100n]) { bigintInRange(b) }
 */
export function bigintInRange(b: bigint): boolean {
  return b >= 0n && b <= 100n;
}

/** Strictly positive and finite: (0, ∞) must exclude 0, -0 (fast-check
 * orders -0 below 0, so excluding the lower bound 0 removes both zeros),
 * NaN, and Infinity.
 *
 * @ensures{strictlyPositive} forall (x: number ∈ (0, ∞)) { numberStrictlyPositive(x) }
 */
export function numberStrictlyPositive(x: number): boolean {
  return x > 0 && Number.isFinite(x) && !Object.is(x, -0);
}

/** Half-open on the right: 10 itself must never be generated.
 *
 * @ensures{halfOpenInt} forall (n: int ∈ [0, 10)) { intInHalfOpen(n) }
 */
export function intInHalfOpen(n: number): boolean {
  return n >= 0 && n < 10;
}

/** Open bigint bounds become ±1-adjusted inclusive bounds.
 *
 * @ensures{bigintOpen} forall (b: bigint ∈ (0n, 100n]) { bigintStrictlyPositive(b) }
 */
export function bigintStrictlyPositive(b: bigint): boolean {
  return b > 0n && b <= 100n;
}

/** (0, ∞) over nat lowers to fc.integer({ min: 1, max: 2^53-1 }): never 0,
 * never negative.
 *
 * @ensures{positiveNat} forall (k: nat ∈ (0, ∞)) { natStrictlyPositive(k) }
 */
export function natStrictlyPositive(k: number): boolean {
  return Number.isInteger(k) && k >= 1;
}

/** A one-sided interval far beyond fc.integer's 32-bit implicit defaults:
 * the unbounded side must be emitted explicitly (clamped to the safe
 * integer range), or fc.integer would reject min > its default max the
 * moment the generated test runs.
 *
 * @ensures{farOutOneSided} forall (n: int ∈ [5000000000, ∞)) { intBeyondInt32(n) }
 */
export function intBeyondInt32(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 5000000000;
}

/** [-1, 0) excludes its upper bound by double adjacency, so the largest
 * generatable value is -0 (which == 0): the body must accept -0 while
 * everything else stays strictly negative.
 *
 * @ensures{halfOpenAtZero} forall (x: number ∈ [-1, 0)) { numberBelowZero(x) }
 */
export function numberBelowZero(x: number): boolean {
  return x >= -1 && (x < 0 || Object.is(x, -0));
}

/** A finite negative nat lower bound clamps to 0, exactly like (-∞: the
 * open bound (-2 adjusts to -1, which floors at 0.
 *
 * @ensures{clampedNat} forall (k: nat ∈ (-2, 5]) { natInClamped(k) }
 */
export function natInClamped(k: number): boolean {
  return Number.isInteger(k) && k >= 0 && k <= 5;
}
