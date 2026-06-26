export type Domain = "int" | "nat" | "number" | "boolean" | "string" | "bigint";

export interface Binder {
  varName: string;
  domain: Domain;
}

export interface PropertySpec {
  name: string;
  functionName: string;
  binders: Binder[];
  /** Desugared boolean expression, ready to drop into a predicate. */
  body: string;
  /** Desugared top-level antecedents, each lifted to fc.pre. */
  preconditions: string[];
  /** Module exports the body/preconditions reference. */
  freeExports: string[];
  location: { file: string; line: number };
}
