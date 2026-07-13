/** @ensures{commutes} forall (x: int) (y: int) { add(x, y) === add(y, x) } */
export function add(x: number, y: number): number {
  return x + y;
}
