/** fast-check's signature example: a law that is true for integers but false
 * for IEEE-754 doubles. fast-check shrinks to a small counterexample (often
 * involving NaN or differing magnitudes).
 *
 * @ensures{associative} (x: number, y: number, z: number) => addAssoc(x, y, z)
 */
export function addAssoc(a: number, b: number, c: number): boolean {
  return (a + b) + c === a + (b + c);
}
