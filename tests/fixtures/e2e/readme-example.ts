/**
 * @ensures{nonzero} forall (x: bigint) (y: number),
 *   Number.isInteger(y) ==> foo(x, y) !== 0
 */
export function foo(x: bigint, y: number): number {
  return 2 * (Number(x) + y) + 1;
}
