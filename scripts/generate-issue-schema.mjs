// Regenerates schemas/issue.schema.json from src/issue-schema.ts.
// Run via: npm run generate:schema  (builds first; imports the compiled module)
import { writeFileSync } from "node:fs";
import { issueJsonSchema } from "../dist/issue-schema.js";

const out = new URL("../schemas/issue.schema.json", import.meta.url);
writeFileSync(out, JSON.stringify(issueJsonSchema(), null, 2) + "\n");
console.log(`wrote ${out.pathname}`);
