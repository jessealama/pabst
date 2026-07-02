# pabst

**p**roperty-**b**ased **t**esting from `@ensures` annotations, powered by [fast-check](https://fast-check.dev/).

Annotate a function with a quantified property in a JSDoc comment, run one command,
and get either "cases passed" or a shrunk counterexample.

Look at this code. We're trying to assert that the value of the function is
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

## Usage

```bash
pabst test <files-or-globs>            # generate, run, and print a JSON report
pabst test --seed <n> <files-or-globs> # reproduce a prior run's generation
pabst gen  <files-or-globs>            # generate only; run your own vitest against .pabst/
```

## Output

`pabst test` prints a single JSON object to **stdout**; **stderr** carries only
progress and crashes. The envelope is always present — a clean run just has an
empty `issues` array:

```json
{
  "version": "0.5.0",
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
issue, and `2` on usage errors.

## Grammar

A property is a universally quantified formula in pabst's **logic surface**.
Glyphs are canonical; ASCII fallbacks are accepted.

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
- **Connectives** (tightest→loosest): `¬` > `∧` > `∨` > `→` > `↔`.
  Fallbacks: `∧`=`/\`, `∨`=`\/`, `→`=`->`/`==>`, `↔`=`<->`/`iff`.
  Negation `¬` is glyph-only.
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

pabst evaluates properties in a free, left-sequential, three-valued logic
(McCarthy / short-circuit logic): `∧`/`∨`/`→` short-circuit left-to-right, and
an atom that throws is the third value. The `→` discard is a sampling control,
not a truth value; `∀` is a sampled (bounded) quantifier.

Each `@ensures{name}` becomes one issue (keyed by file, function, and property
name) if it fails. Generated files land in a gitignored `.pabst/` directory
mirroring the source tree; they are regenerated every run and must never be
hand-edited.

## Development

```bash
npm install
npm test          # vitest
npm run build     # tsc -> dist/
```

Requires Node 24+.
