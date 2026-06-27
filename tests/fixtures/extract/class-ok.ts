export class Counter {
  constructor(private readonly n: number) {}

  /** @ensures{incAddsOne} forall (x: int), new Counter(x).inc().value === x + 1 */
  inc(): Counter {
    return new Counter(this.n + 1);
  }

  /** @ensures{ofRoundTrips} forall (x: int), Counter.of(x).value === x */
  static of(x: number): Counter {
    return new Counter(x);
  }

  // no @ensures — must be left alone
  get value(): number {
    return this.n;
  }

  // no @ensures — must be left alone
  private secret(): number {
    return this.n;
  }
}

/** @ensures{incAddsOne} forall (x: int), bump(x) === x + 1 */
export function bump(x: number): number {
  return x + 1;
}
