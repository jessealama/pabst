/** @ensures{nonzero} (x: int, y: number) =>
 *    { pre(Math.isInteger(y)); return foo(x, y) !== 0; } */
export function foo(x: bigint, y: number): number {
  return Number(x) + (y === 0 ? 1 : y);
}

export function helper(n: number): number {
  return n;
}
