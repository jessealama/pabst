class Box {
  /** @ensures{p} forall (x: int), Box.id(x) === x */
  static id(x: number): number {
    return x;
  }
}
