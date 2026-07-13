/** A round-trip that looks plausible but fails: parseInt only reads the
 * integer prefix, so it is not the inverse of String over reals.
 * String(0.5) === "0.5", parseInt("0.5", 10) === 0 !== 0.5.
 *
 * @ensures{parseIntInverts} forall (x: number) { parseRoundTrips(x) }
 */
export function parseRoundTrips(x: number): boolean {
  return parseInt(String(x), 10) === x;
}
