import type { RunMeta } from "../../src/envelope.js";
import type { Issue } from "../../src/contract.js";

// Envelope meta is echoed through verbatim; these placeholder values just
// need to be recognizable in the output.
export const META: RunMeta = {
  version: "0.0.0-test",
  startedAt: "2026-07-03T00:00:00.000Z",
  cwd: "/repo",
  seed: 42,
  generated: 1,
};

export const FALSIFIED: Issue = {
  file: "a.ts",
  function: "f",
  property: "p",
  kind: "falsified",
  counterexample: { x: 1 },
};
