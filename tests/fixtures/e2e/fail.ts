/** @ensures{wrong} forall (x: nat) { isZero(x) === true } */
export function isZero(x: number): boolean {
  return x === 0;
}
