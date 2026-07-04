/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  // The dedicated vitest runner forces the worker-threads pool, which breaks
  // the CLI tests (process.chdir() is unavailable in worker threads), so run
  // the suite as a plain command instead. --bail stops at the first failure,
  // which is all Stryker needs to count a mutant as killed.
  testRunner: "command",
  commandRunner: {
    command: "./node_modules/.bin/vitest run --bail 1",
  },
  mutate: ["src/**/*.ts", "!src/**/*.d.ts"],
  // Only banner-comment the mutated files: the default (all .ts files)
  // inserts `// @ts-nocheck` into test fixtures, which breaks tests that
  // depend on fixtures' exact bytes and line numbers.
  disableTypeChecks: "src/**/*.ts",
  reporters: ["clear-text", "html", "progress"],
};
