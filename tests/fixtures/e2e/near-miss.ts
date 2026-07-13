/** A near-miss hosted on a static method: `negate` agrees with `0 - x` for
 * every double except +0, where it yields -0 and Object.is(-0, 0) is false. */
export class Arith {
  /** @ensures{matchesSubtraction} forall (x: number) { Object.is(Arith.negate(x), 0 - x) } */
  static negate(x: number): number {
    return -x;
  }
}
