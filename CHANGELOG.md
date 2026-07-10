# Changelog

Notable changes to pabst. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[semver](https://semver.org/).

## [0.7.0]

### Added

- Equation syntax in formulas: `A ≡ B` is sugar for `Object.is(A, B)`, and
  `A ≢ B` for `!Object.is(A, B)`. The glyphs are canonical and — like `¬` —
  have no ASCII operator fallback: in plain ASCII, call `Object.is(A, B)`
  directly. Equations work at every depth inside an atom, including callback
  bodies, and bind like JS `==`. Chained equations (`a ≡ b ≡ c`) are
  rejected — write `a ≡ b ∧ b ≡ c`. Because `≡` binds tighter than `??` and
  `?:`, `a ≡ b ?? c` and `a ≡ b ? c : d` are rejected too — parenthesize the
  intended grouping. Diagnostics show the equation as written; the generated
  test code carries the `Object.is` form.

### Breaking

- JS loose equality `==` and loose inequality `!=` in a formula atom are now
  compile errors: use `≡` / `≢` (identity) or `===` / `!==` (JS strict).
- Assignment expressions — plain `=` and the compound forms (`+=`, `||=`,
  `>>=`, …) — cannot appear inside a formula atom (default-parameter
  initializers in callbacks are fine), and `≠` is rejected with a hint to
  write `≢`.

### Fixed

- Connective glyphs inside template-literal text (e.g. ``p(`${a} ∧ ${b}`)``)
  no longer split the atom: the formula lexer now tracks `${…}`
  substitutions and stays in template mode.
- A `/` after `this`, `true`/`false`/`null`, postfix `++`/`--`, `}`, or a
  template literal is now scanned as division, not the start of a regex
  literal (an equation glyph after such a `/` used to be skipped silently).

## [0.6.0] - 2026-07-09

### Added

- Bounded intervals for numeric binders: a binder may constrain `int`, `nat`,
  `number`, or `bigint` to a closed interval, e.g.
  `forall (x: int ∈ [1, 30])` (ASCII fallback: `in`). The interval lowers to
  fast-check's native bounded arbitraries (`fc.integer({min, max})` etc.), so
  values generate in-range directly — no more `exhausted` runs from
  range-guard preconditions, and no distribution-distorting tricks like
  `1 + (n % 30)` in atoms. Bounded `number` intervals never generate `NaN`.

## [0.5.0]

- Last version before this changelog existed.
