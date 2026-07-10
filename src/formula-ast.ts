export type Formula =
  | { kind: "atom"; text: string; js: string }
  | { kind: "not"; arg: Formula }
  | { kind: "and"; left: Formula; right: Formula }
  | { kind: "or"; left: Formula; right: Formula }
  | { kind: "iff"; left: Formula; right: Formula }
  | { kind: "implication"; antecedents: Formula[]; consequent: Formula };

/** All atom executable JS expressions (equation-desugared), left-to-right. */
export function collectAtoms(f: Formula): string[] {
  switch (f.kind) {
    case "atom":
      return [f.js];
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
