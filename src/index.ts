export type { Domain, Binder, PropertySpec } from "./ir.js";
export type { Issue, IssueKind, Envelope } from "./issue.js";
export { buildSpecs } from "./build-spec.js";
export { emit } from "./emit.js";
export { generate, type GenResult } from "./codegen.js";
export { buildEnvelope, type VitestJson, type RunMeta } from "./envelope.js";
