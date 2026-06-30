/** A counter meant to clamp at zero. */
export class BoundedCounter {
  constructor(private readonly n: number) {}

  /** Decrement, clamped at zero — BUG: the guard should be `<= 0`, so dec()
   * on 0 yields -1 instead of staying at 0.
   * @ensures{neverNegative} (x: nat) => new BoundedCounter(x).dec().value >= 0 */
  dec(): BoundedCounter {
    return new BoundedCounter(this.n < 0 ? 0 : this.n - 1);
  }

  get value(): number {
    return this.n;
  }
}
