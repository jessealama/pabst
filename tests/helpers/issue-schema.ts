import { readFileSync } from "node:fs";
import { Ajv } from "ajv";
import { expect } from "vitest";

const schemaPath = new URL("../../schemas/issue.schema.json", import.meta.url).pathname;
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
const ajv = new Ajv({ allErrors: true });
const validate = ajv.compile(schema);

/** Fail the current test if `issue` does not match the issue JSON Schema. */
export function expectValidIssue(issue: unknown): void {
  if (!validate(issue)) {
    expect.fail(
      `issue failed schema validation: ${ajv.errorsText(validate.errors)}\n` +
        JSON.stringify(issue, null, 2),
    );
  }
}
