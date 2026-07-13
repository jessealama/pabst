# Changelog

Notable changes to pabst. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow
[semver](https://semver.org/).

## [0.12.1] - 2026-07-13

### Fixed

- `pabst test` runs only the tests it just generated, so stale files in
  `.pabst/` from earlier invocations no longer pollute the envelope.

## [0.12.0] - 2026-07-13

### Changed

- The npm package is renamed to `pabst-checker`; the bin stays `pabst`.

## [0.11.0] - 2026-07-13

### Changed

- **Breaking:** the equation glyphs `≡`/`≢` are now available only at an
  atom's top level, making the equation a real grammar production. In
  nested positions — callbacks, call arguments, template substitutions —
  call `Object.is(A, B)` (or `!Object.is(A, B)`) directly; a nested glyph
  is rejected with exactly that hint. Relatedly, a parenthesized equation
  feeding `??` or `?:` (e.g. `(a ≡ b) ? c : d`) is now a nested position:
  use `Object.is` there too. An equation also may not sit beside a
  depth-0 comma or unparenthesized arrow function (e.g. `a, b ≡ x` or
  `p ≡ x => f(x)`): parenthesize the intended operand.

### Added

- The annotation surface syntax now has a normative grammar:
  [`docs/grammar.ebnf`](docs/grammar.ebnf). The parser is a token-based
  recursive descent mirroring it production-for-production, replacing the
  character-level scanning of the binder prefix.

## [0.10.0]

### Added

- Regex guards for string binders: `forall (s: string ∈ /[a-z]+/)`
  generates only strings matching the pattern, lowered to fast-check's
  `stringMatching`. Membership is whole-string: pabst anchors the pattern
  (`^(?:...)$`), so an unanchored guard never generates padded values.
  Flags `s` and `u` are allowed; `m` (which would silently reintroduce
  substring semantics), the generation-irrelevant `g`/`y`/`d`, and the
  fast-check-unsupported `i`/`v` are compile-time errors, as are patterns
  outside fast-check's subset (lookarounds, backreferences, `\b`) — pabst
  validates by probing fast-check itself at generation time. A `*/`
  inside a pattern ends the enclosing JSDoc comment early; the resulting
  parse error hints to write `{0,}` instead of a trailing `*`. (#30)

### Changed

- `fast-check` and `@fast-check/vitest` are now peer dependencies (npm
  installs them automatically). Pabst validates regex guards and number
  intervals by probing fast-check, so it must probe the same copy the
  generated spec runs against; as regular dependencies, a project pinning
  its own fast-check could pass validation yet fail at test time.

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
