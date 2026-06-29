/** A round-trip that genuinely holds: stringifying an integer and parsing it
 * back with Number is the identity. Uses the `int` domain, so no NaN is
 * generated (Number(String(NaN)) === NaN would be false).
 *
 * @ensures{roundTrips} forall (x: int), idViaString(x) === x
 */
export function idViaString(x: number): number {
  return Number(String(x));
}
