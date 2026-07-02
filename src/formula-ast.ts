export type Formula =
  | { kind: "atom"; text: string }
  | { kind: "not"; arg: Formula }
  | { kind: "and"; left: Formula; right: Formula }
  | { kind: "or"; left: Formula; right: Formula }
  | { kind: "iff"; left: Formula; right: Formula }
  | { kind: "implication"; antecedents: Formula[]; consequent: Formula };

/** All atom source texts in left-to-right order. */
export function collectAtoms(f: Formula): string[] {
  switch (f.kind) {
    case "atom":
      return [f.text];
    case "not":
      return collectAtoms(f.arg);
    case "and":
    case "or":
    case "iff":
      return [...collectAtoms(f.left), ...collectAtoms(f.right)];
    case "implication":
      return [
        ...f.antecedents.flatMap(collectAtoms),
        ...collectAtoms(f.consequent),
      ];
  }
}
