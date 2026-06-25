# pabst

**p**roperty-**b**ased **t**esting from `@ensures` annotations, powered by [fast-check](https://fast-check.dev/).

Annotate a function with a quantified property in a JSDoc comment, run one command,
and get either "cases passed" or a shrunk counterexample.

```ts
/** @ensures{nonzero} forall (x: int) (y: number),
 *    Math.isInteger(y) ==> foo(x, y) !== 0 */
export function foo(x: bigint, y: number): number { /* ... */ }
```

## Usage

```bash
pabst test <files-or-globs>   # generate property tests into .pabst/ and run vitest
pabst gen  <files-or-globs>   # generate only; run your own vitest against .pabst/
```

## Grammar (MVP)

- **Quantifier:** `forall` / `∀` only, one-or-more binder groups, then a comma, then a
  JS boolean body. Lean-style grouping `(x y: int)` supported.
- **Generation domains:** `int`, `nat`, `number`, `boolean`, `string`, `bigint`. The
  binder domain drives generation, decoupled from the function's TS parameter types.
- **Implication:** `==>` / `->` / `→`. Top-level antecedents become `fc.pre(...)`
  (discarded cases, QuickCheck-style); arrows nested inside parentheses become
  `!(P) || (Q)`.
- **Scoping:** every symbol a property references must be `export`ed from its module
  (the usual "you import what you test" rule). Unknown references are a hard error.
- **Evaluation:** the body must evaluate to a boolean — `true` passes, `false` or a
  thrown error is a counterexample, and a non-boolean result is a distinct error.

Each `@ensures{name}` becomes a `pabst › <function> › <name>` entry in vitest's
report. Generated files land in a gitignored `.pabst/` directory mirroring the source
tree; they are regenerated every run and must never be hand-edited.

## Development

```bash
npm install
npm test          # vitest
npm run build     # tsc -> dist/
```

Requires Node 24+.
