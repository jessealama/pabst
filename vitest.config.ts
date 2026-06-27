import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", ".pabst/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // Count every source file, even ones no test imports, so untested
      // code drags the baseline down instead of hiding from the ratchet.
      all: true,
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.d.ts"],
      reporter: ["text", "html"],
      thresholds: {
        // Ratchet: when coverage rises, Vitest rewrites these numbers
        // upward in this file; if it drops below, the run fails. Seeded
        // from the baseline on 2026-06-27 — bump only happens via autoUpdate.
        autoUpdate: true,
        statements: 92.59,
        branches: 87.5,
        functions: 100,
        lines: 96.6,
      },
    },
  },
});
