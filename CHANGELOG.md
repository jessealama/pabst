# Changelog

Notable changes to pabst. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[semver](https://semver.org/).

## [0.9.0]

### Added

- Binder intervals may be open or half-open — `(0, 1]`, `[0, 30)` — and
  endpoints may be unbounded: `∞`/`-∞` (ASCII: `Infinity`). So
  `(x: number ∈ (0, ∞))` expresses "strictly positive number", excluding
  `0`, `-0`, `NaN`, and `Infinity`; a closed ∞ endpoint (`[0, ∞]`) allows
  `Infinity` itself to be generated. Open `int`/`nat`/`bigint` bounds
  adjust the inclusive bound by ±1, and an ∞ endpoint there must be open.
  For `int`/`nat` an unbounded side means the safe integer limit
  (±2^53 − 1) — both bounds are always emitted, since fast-check's
  implicit 32-bit defaults reject far-out one-sided bounds — and a finite
  endpoint beyond that limit clamps to it with a stderr warning (an error
  only when nothing satisfiable remains). A `nat` interval reaching below
  0 clamps to 0, so `(-2, 5]` and `(-∞, 5]` denote the same naturals.
  `number` intervals follow fast-check's double ordering, in which every
  double is distinct: `-0` sits below `0` (`(-0, 0]` is the singleton
  `{0}`, `[0, -0]` is empty) and an excluded bound removes exactly one
  adjacent double — so `[-1, 0)` can generate `-0`, which `== 0`, and
  `(0, 5e-324)` is rejected as empty. A bounded `number` never generates
  `NaN`. (#29)

## [0.8.0]

### Added

- Zero-argument invocation: `pabst test` and `pabst gen` with no file
  arguments discover the project's sources — the files `tsconfig.json`
  would compile or, failing that, `src/**` — and announce on stderr what
  they found. When neither yields anything, pabst exits 2 asking for an
  explicit glob. Discovery reads the config the way `tsc` does but stays
  usable where `tsc` would still enumerate the same files: diagnostics
  about `compilerOptions` (an unknown flag or value, typically version skew
  between the project's TypeScript and pabst's) are ignored, and an empty
  `files` list falls through to `src/**` like any other input-less config.
  A `files` entry naming a path that no longer exists is a one-line exit-2
  error, and files outside the current directory (a monorepo `include` of
  `../shared`, say) are skipped — generated tests live in `./.pabst/`, so
  only the package pabst runs in can be tested. (#23)

### Fixed

- Declaration files (`.d.ts`/`.d.mts`/`.d.cts`) are excluded from file
  lists unless a pattern explicitly names them (`pabst gen "index.d.ts"`);
  previously a glob matching build output sitting next to its sources
  extracted each property twice, with the declaration-file copies failing
  spuriously. (#23)
- `pabst gen`/`pabst test` on a file outside the current directory now
  exits 2 with a one-line error; previously the generated test landed
  outside `.pabst/`, where `pabst test` never ran it, silently passing. (#23)

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
