/** @ensures{notBool} forall (x: int), addOne(x) ∧ isPos(x) */
export function addOne(x: number): number { return x + 1; }
export function isPos(x: number): boolean { return x > 0; }
