export class Box {
  /** @ensures{p} forall (x: int), Box.touch(x) === x */
  private touch(x: number): number {
    return x;
  }
}
