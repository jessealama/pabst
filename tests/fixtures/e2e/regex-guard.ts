/** The guard is deliberately unanchored: membership means the whole
 * string matches, so pabst anchors it. The body re-checks with explicit
 * anchors — a padded value like "3fk!" falsifies the property.
 *
 * @ensures{lowercaseWord} forall (s: string ∈ /[a-z]+/) { isLowercaseWord(s) }
 */
export function isLowercaseWord(s: string): boolean {
  return /^[a-z]+$/.test(s);
}

/** Exercises the ASCII `in` fallback and the u flag with \p{..} escapes.
 * Uppercase letters include astral code points, so the body counts code
 * points (spread), not UTF-16 units (.length).
 *
 * @ensures{upperLetters} forall (s: string in /\p{Lu}{2,5}/u) { isShortUpper(s) }
 */
export function isShortUpper(s: string): boolean {
  const chars = [...s];
  return (
    chars.length >= 2 &&
    chars.length <= 5 &&
    chars.every((c) => /^\p{Lu}$/u.test(c))
  );
}
