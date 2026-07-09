# Changelog

Notable changes to pabst. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[semver](https://semver.org/).

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
