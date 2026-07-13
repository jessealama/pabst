/** Immutable counter — shows @ensures on instance and static methods. */
export class Counter {
  constructor(private readonly n: number) {}

  /** @ensures{incAddsOne} forall (x: int) { new Counter(x).inc().value === x + 1 } */
  inc(): Counter {
    return new Counter(this.n + 1);
  }

  /** @ensures{ofRoundTrips} forall (x: int) { Counter.of(x).value === x } */
  static of(x: number): Counter {
    return new Counter(x);
  }

  get value(): number {
    return this.n;
  }
}
