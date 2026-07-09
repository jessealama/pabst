# Pabst: A blue-ribbon approach to **P**roperty-**B**ased **T**esting

Annotate your functions with properties they're supposed to have, then try to invalidate them with [fast-check](https://fast-check.dev/).

Put the properties your functions should have in a JSDoc comment, run Pabst,
and get either "cases passed" or a counterexample that shows the property doesn't hold.

_Example_ Look at this code. We're trying to assert that the value of the function is
non-zero provided the second argument is an integer. Can you spot the error?

```ts
/**
 * @ensures{nonzero} forall (x: bigint) (y: number),
 *   Number.isInteger(y) ==> foo(x, y) !== 0
 */
export function foo(x: bigint, y: number): number {
  return Number(x % 2n) + (y % 2) + 1;
}
```

Each remainder looks like it should be 0 or 1, so the sum looks like it's at
least 1. But JavaScript's `%` returns _negative_ remainders for negative
operands: `foo(-1n, 0)` is `-1 + 0 + 1 === 0`. You don't have to spot that —
`pabst test` falsifies the property and reports a counterexample.

## Philosophy

Pabst is a property-based testing tool. Instead of checking
your function against a handful of hand-picked examples,
pabst (delegating to `fast-check`) generates many random
inputs and works hard to **refute** the property you
attached; when it succeeds, it shrinks the failure to a
small, readable counterexample. One thing should be
understood, though: failing to invalidate a property — even
across many runs — is no _proof_ that the property holds. It
is evidence that it holds, but the property might still be
false on inputs the generator never tried. If your goal is
to prove the absence of counterexamples, you need
proof-based tools such as
[Thales](https://github.com/jessealama/thales). That said,
property-based testing is a powerful technique that exposes
a lot of bugs for very little effort, and it sits
comfortably alongside proof-based approaches.

## Installation

```bash
npm install --save-dev @jessealama/pabst
```

The package is `@jessealama/pabst`; the command it installs is `pabst`.

Requires Node 24+. Pabst bundles its own [fast-check](https://fast-check.dev/)
and [vitest](https://vitest.dev/), so nothing else is needed.

## Usage

```bash
pabst test <files-or-globs>            # generate, run, and print a JSON report
pabst test --seed <n> <files-or-globs> # reproduce a prior run's generation
pabst gen  <files-or-globs>            # generate only; run your own vitest against .pabst/
```

Pabst writes the test files it generates to a `.pabst/` directory in your
project. Those files are regenerated on every run, so there is no reason to
commit them — add `.pabst/` to your `.gitignore`:

```gitignore
.pabst/
```

## Output

`pabst test` prints a single JSON object to **stdout**; **stderr** carries only
progress and crashes. The envelope is always present — a clean run just has an
empty `issues` array:

```json
{
  "version": "0.6.0",
  "startedAt": "2026-06-26T17:42:03.000Z",
  "cwd": "/path/to/project",
  "seed": 1834592013,
  "generated": 5,
  "passed": 5,
  "failed": 0,
  "issues": []
}
```

Each issue records where the property lived and why it failed:

```json
{
  "file": "src/math.ts",
  "function": "add",
  "property": "commutes",
  "kind": "falsified",
  "counterexample": { "x": 1, "y": 2 }
}
```

- `kind` is `"falsified"` (returned `false`), `"threw"` (raised an exception —
  see `error`), or `"exhausted"` (too many precondition skips — `error` explains,
  and there is no `counterexample`).
- Counterexample values are JSON-native where they round-trip; bigints and
  non-finite numbers appear as fast-check strings (e.g. `"1n"`).
- The `seed` is generated per run and echoed back; pass it to `--seed` to
  reproduce a failing run exactly.

The process exits `0` when `issues` is empty, `1` when there is at least one
issue, and `2` on usage errors — including annotation errors such as a
malformed formula, an unsupported domain, or a reference to an unexported
symbol, which are reported as a one-line message on stderr.

## Grammar

A property is a universally quantified formula in Pabst's **logic surface**.
Non-ASCII symbols are the canonical form; ASCII fallbacks are available.

```ts
/**
 * @ensures{guarded} forall (x: int),
 *   isPrime(x) ∧ x > 2 → isOdd(x)
 */
```

- **Quantifier:** `forall` / `∀`, one-or-more binder groups, then a comma, then
  the body. Lean-style grouping `(x y: int)` is supported. Existential `∃` /
  `exists` is intentionally rejected (PBT cannot soundly confirm existence).
- **Domains:** `int`, `nat`, `number`, `boolean`, `string`, `bigint`.
  A numeric domain (`int`, `nat`, `number`, `bigint`) may be constrained to a
  closed interval: `forall (x: int ∈ [1, 30])` (ASCII fallback: `in`). Both
  bounds are inclusive and required; open intervals like `[0, 30)` are
  rejected. A bounded `number` never generates `NaN`.
- **Connectives** (tightest→loosest): `¬` > `∧` > `∨` > `→` > `↔`.
  Fallbacks: `∧`=`/\`, `∨`=`\/`, `→`=`->`/`==>`, `↔`=`<->`/`iff`.
  Negation `¬` is glyph-only.
- **Equations:** `A = B` means identity — sugar for `Object.is(A, B)`; `A ≠ B`
  (ASCII: `A != B`) is its negation. This is SameValue, not mathematical
  equality: `NaN = NaN` holds and `-0 = 0` does not, so `x + 0 = x` is
  refutable at `x = -0` (guard with `x ≠ -0 →` if that is intended). Equations
  apply at every depth of an atom, callbacks included (`xs.every(x => x = 0)`),
  so JS assignment cannot appear in a formula. `=` binds like JS `==`: tighter
  than `&&`/`||`/`?:`, looser than `<`/`<=`. Chains like `a = b = c` are
  errors — write `a = b ∧ b = c`. Loose equality `==` is an error (use `=` or
  `===`); `===`/`!==` keep their exact JS meaning.
- **Atoms are JavaScript** and must be genuine booleans — every atom is checked
  at runtime (`5 ∧ true` is an error, not a coercion). You may **not** use JS
  `&&`/`||`/`!` at an atom's top level — use the glyphs. They remain legal
  _inside_ a leaf (e.g. a callback `xs.every(x => x > 0 && x < 10)`).
- **Implication discard:** a **top-level** `→`'s antecedents become `fc.pre(...)`
  (QuickCheck-style discarded cases, reported as `exhausted` if too many skip);
  a **parenthesised** `→` is ordinary material implication `¬P ∨ Q`.
- **Biconditional** `↔` is non-associative (parenthesise chains) and is _not_ a
  discard — it lowers to boolean equality.
- **Scoping:** every symbol an atom references must be `export`ed from its module.

Each `@ensures{name}` becomes one issue (keyed by file, function, and property
name) if it fails. Generated files land in the `.pabst/` directory (see
[Usage](#usage)) mirroring the source tree; they are regenerated every run and
must never be hand-edited.

## Development

```bash
npm install
npm test          # vitest
npm run build     # tsc -> dist/
```

Requires Node 24+.
