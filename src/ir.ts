export type Domain = "int" | "nat" | "number" | "boolean" | "string" | "bigint";

export interface Binder {
  varName: string;
  domain: Domain;
}

export interface PropertySpec {
  name: string;
  functionName: string;
  /** Set when the property lives on a class method. */
  className?: string;
  /** Meaningful only when className is set: true for a static method. */
  isStatic?: boolean;
  binders: Binder[];
  /** Desugared boolean expression, ready to drop into a predicate. */
  body: string;
  /** Desugared top-level antecedents, each lifted to fc.pre. */
  preconditions: string[];
  /** Module exports the body/preconditions reference. */
  freeExports: string[];
  location: { file: string; line: number };
}
