/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  testRunner: "command",
  commandRunner: {
    command: "./node_modules/.bin/vitest run --bail 1",
  },
  mutate: ["src/**/*.ts", "!src/**/*.d.ts"],
  ignorePatterns: [".pabst", "coverage", "reports"],
  concurrency: 8,
  timeoutFactor: 3,
  timeoutMS: 60000,
  disableTypeChecks: "src/**/*.ts",
  reporters: ["clear-text", "html", "progress"],
};
