/** The two "getting started" laws from fast-check's README, in pabst form.
 * `contains` is the function under test; both properties hold for every
 * string, including the empty string.
 *
 * @ensures{containsItself} forall (s: string), contains(s, s)
 * @ensures{containsSubstring} forall (a b c: string), contains(a + b + c, b)
 */
export function contains(text: string, pattern: string): boolean {
  return text.indexOf(pattern) >= 0;
}
