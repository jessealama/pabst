export class Box {
  constructor(private readonly n: number) {}

  /** @ensures{p} forall (x: int), new Box(x).value === x */
  get value(): number {
    return this.n;
  }
}
