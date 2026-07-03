import { expect } from "vitest";
import { PabstError } from "../../src/errors.js";

/**
 * Assert that `fn` throws a PabstError matching `match`. The class matters
 * as much as the message: only PabstError maps to the CLI's exit-2 error
 * mode, so a throw site regressing to plain Error breaks the exit-code
 * contract even if its message survives.
 */
export function expectPabstError(
  fn: () => unknown,
  match: RegExp | string,
): void {
  expect(fn).toThrow(PabstError);
  expect(fn).toThrow(match);
}
