/** @ensures{deMorgan} forall (a: boolean) (b: boolean),
 *    ¬(orB(a, b)) ↔ andB(notB(a), notB(b)) */
export function orB(a: boolean, b: boolean): boolean { return a || b; }
export function andB(a: boolean, b: boolean): boolean { return a && b; }
export function notB(a: boolean): boolean { return !a; }

/** @ensures{guarded} forall (x: int),
 *    isPos(x) ∧ isSmall(x) → inRange(x) */
export function isPos(x: number): boolean { return x > 0; }
export function isSmall(x: number): boolean { return x < 100; }
export function inRange(x: number): boolean { return x > 0 && x < 100; }
