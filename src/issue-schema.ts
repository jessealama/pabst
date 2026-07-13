import { z } from "zod";
import { QUALIFIED_NAME_PATTERN } from "./qualified-name.js";

/**
 * Single source of truth for the issue wire shape. The static type side is
 * guarded one-way against the loose `Issue` interface in contract.ts (see
 * tests/contract-pins.test.ts); the JSON side is generated into
 * schemas/issue.schema.json (npm run generate:schema) and pinned by a
 * deep-equal sync test.
 */

const functionName = z.string().regex(QUALIFIED_NAME_PATTERN).meta({
  id: "functionName",
  description:
    "Bare function name, or Class#method (instance) / Class.method (static).",
});

const counterexample = z
  .record(z.string(), z.union([z.number(), z.boolean(), z.string()]))
  .meta({ id: "counterexample" });

const common = {
  file: z.string(),
  function: functionName,
  property: z.string().min(1),
};

export const IssueSchema = z
  .discriminatedUnion("kind", [
    z
      .strictObject({
        ...common,
        kind: z.literal("falsified"),
        counterexample,
      })
      .meta({ title: "falsified" }),
    z
      .strictObject({
        ...common,
        kind: z.literal("threw"),
        counterexample,
        error: z.string(),
      })
      .meta({ title: "threw" }),
    z
      .strictObject({
        ...common,
        kind: z.literal("exhausted"),
        error: z.string(),
      })
      .meta({ title: "exhausted" }),
  ])
  .meta({
    title: "Pabst Issue",
    description: "A single property failure emitted by the pabst reporter.",
  });

/** The issue JSON Schema as a plain object — the generator and the sync test both call this. */
export function issueJsonSchema(): unknown {
  const schema = z.toJSONSchema(IssueSchema, { target: "draft-7" }) as Record<
    string,
    unknown
  >;
  // zod ignores a root-level meta id, so the document identifier is stamped here.
  return {
    $schema: schema.$schema,
    $id: "https://pabst.test/schemas/issue.schema.json",
    ...schema,
  };
}
