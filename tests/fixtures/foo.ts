/** @ensures{nonzero} forall (x: int) (y: number),
 *    Math.isInteger(y) ==> foo(x, y) !== 0 */
export function foo(x: bigint, y: number): number {
  return Number(x) + (y === 0 ? 1 : y);
}

export function helper(n: number): number {
  return n;
}
