# Changelog

Notable changes to pabst. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[semver](https://semver.org/).

## [0.7.0]

### Added

- Equation syntax in formulas: `A = B` is sugar for `Object.is(A, B)`, and
  `A ≠ B` (ASCII: `A != B`) for `!Object.is(A, B)`. Equations work at every
  depth inside an atom, including callback bodies, and bind like JS `==`.
  Chained equations (`a = b = c`) are rejected — write `a = b ∧ b = c`.
  Because `=` binds tighter than `??` and `?:`, `a = b ?? c` and
  `a = b ? c : d` are rejected too — parenthesize the intended grouping.
  Diagnostics show the equation as written; the generated test code carries
  the `Object.is` form.

### Breaking

- `!=` in a formula atom now means `!Object.is(A, B)`, not JS loose
  inequality.
- JS loose equality `==` in a formula atom is now a compile error: use `=`
  (identity) or `===` (JS strict equality).
- Plain `=` assignment expressions (and default-parameter initializers) can no
  longer appear inside a formula atom.

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
