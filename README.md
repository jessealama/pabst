# pabst

**p**roperty-**b**ased **t**esting from `@ensures` annotations, powered by [fast-check](https://fast-check.dev/).

Annotate a function with a property — written as a TypeScript arrow function —
in a JSDoc comment, run one command, and get either "cases passed" or a shrunk
counterexample.

```ts
/** @ensures{nonzero} (x: int, y: number) =>
 *    { pre(Math.isInteger(y)); return foo(x, y) !== 0; } */
export function foo(x: bigint, y: number): number { /* ... */ }
```

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
  "version": "0.0.1",
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

## Grammar (MVP)

- **Shape:** a property is a TypeScript **arrow function**. The parameter list
  is the binder list; the body is a JS boolean expression. Example:
  `@ensures{nonzero} (x: int, y: number) => foo(x, y) !== 0`.
- **Generation domains:** `int`, `nat`, `number`, `boolean`, `string`, `bigint`,
  written in the parameter's type-annotation slot. The domain drives generation
  and is decoupled from the function's TS parameter types. (`int`/`nat` are pabst
  domains, not TS types; pabst only parses, never typechecks, the formula.)
- **Preconditions / discard:** use a block body with a `pre(cond)` guard and a
  `return`: `(x: nat) => { pre(x > 100); return foo(x) > 0; }`. Each `pre(...)`
  becomes an `fc.pre(...)` discard (QuickCheck-style; can report `exhausted`).
- **Implication:** write `!p || q`, or use the `implies(p, q)` builtin.
- **Scoping:** every symbol a property references must be `export`ed from its
  module (the usual "you import what you test" rule). `pre` and `implies` are
  pabst builtins and need no export. Unknown references are a hard error.
- **Evaluation:** the body must evaluate to a boolean — `true` passes, `false`
  or a thrown error is a counterexample, and a non-boolean result is a distinct
  error.

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
