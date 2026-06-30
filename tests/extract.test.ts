import { describe, it, expect } from "vitest";
import { extractFromSource } from "../src/extract.js";

const FOO = `/** @ensures{nonzero} (x: int, y: number) =>
 *    { pre(Math.isInteger(y)); return foo(x, y) !== 0; } */
export function foo(x: bigint, y: number): number {
  return Number(x) + (y === 0 ? 1 : y);
}

export function helper(n: number): number {
  return n;
}
`;

describe("extract", () => {
  it("reads exported names", () => {
    const r = extractFromSource(FOO, "foo.ts");
    expect([...r.exports].sort()).toEqual(["foo", "helper"]);
  });

  it("reads the @ensures annotation attached to its function", () => {
    const r = extractFromSource(FOO, "foo.ts");
    expect(r.annotations).toHaveLength(1);
    const a = r.annotations[0]!;
    expect(a.propertyName).toBe("nonzero");
    expect(a.functionName).toBe("foo");
    expect(a.formula).toContain("(x: int, y: number)");
    expect(a.formula).toContain("foo(x, y) !== 0");
    expect(a.line).toBeGreaterThan(0);
  });

  it("records every @ensures in a single JSDoc block as its own property", () => {
    const src = `/**
 * @ensures{lo} (x: int) => foo(x) >= 0
 * @ensures{hi} (x: int) => foo(x) <= 100
 */
export function foo(x: number): number { return x; }
`;
    const r = extractFromSource(src, "multi.ts");
    expect(r.annotations.map((a) => a.propertyName)).toEqual(["lo", "hi"]);
    expect(r.annotations[0]!.formula).toBe("(x: int) => foo(x) >= 0");
    expect(r.annotations[1]!.formula).toBe("(x: int) => foo(x) <= 100");
  });
});

const CLASS_OK = `export class Counter {
  constructor(private readonly n: number) {}

  /** @ensures{incAddsOne} (x: int) => new Counter(x).inc().value === x + 1 */
  inc(): Counter {
    return new Counter(this.n + 1);
  }

  /** @ensures{ofRoundTrips} (x: int) => Counter.of(x).value === x */
  static of(x: number): Counter {
    return new Counter(x);
  }

  // no @ensures — must be left alone
  get value(): number {
    return this.n;
  }

  // no @ensures — must be left alone
  private secret(): number {
    return this.n;
  }
}

/** @ensures{incAddsOne} (x: int) => bump(x) === x + 1 */
export function bump(x: number): number {
  return x + 1;
}
`;

const CLASS_PRIVATE = `export class Box {
  /** @ensures{p} (x: int) => Box.touch(x) === x */
  private touch(x: number): number {
    return x;
  }
}
`;

const CLASS_ACCESSOR = `export class Box {
  constructor(private readonly n: number) {}

  /** @ensures{p} (x: int) => new Box(x).value === x */
  get value(): number {
    return this.n;
  }
}
`;

const CLASS_UNEXPORTED = `class Box {
  /** @ensures{p} (x: int) => Box.id(x) === x */
  static id(x: number): number {
    return x;
  }
}
`;

const CLASS_DUP = `export class Box {
  /**
   * @ensures{p} (x: int) => Box.id(x) === x
   * @ensures{p} (x: int) => Box.id(x) === x
   */
  static id(x: number): number {
    return x;
  }
}
`;

describe("extract — class methods", () => {
  it("records instance and static method annotations with className/isStatic", () => {
    const r = extractFromSource(CLASS_OK, "class-ok.ts");
    const inc = r.annotations.find((a) => a.functionName === "inc")!;
    expect(inc.className).toBe("Counter");
    expect(inc.isStatic).toBe(false);
    expect(inc.propertyName).toBe("incAddsOne");

    const of = r.annotations.find((a) => a.functionName === "of")!;
    expect(of.className).toBe("Counter");
    expect(of.isStatic).toBe(true);
  });

  it("leaves a free function annotation unqualified", () => {
    const r = extractFromSource(CLASS_OK, "class-ok.ts");
    const bump = r.annotations.find((a) => a.functionName === "bump")!;
    expect(bump.className).toBeUndefined();
    expect(bump.isStatic).toBeUndefined();
  });

  it("does not collide a method and a free function sharing a property name", () => {
    const r = extractFromSource(CLASS_OK, "class-ok.ts");
    // "incAddsOne" appears on both Counter#inc and bump — both are kept
    const both = r.annotations.filter((a) => a.propertyName === "incAddsOne");
    expect(both).toHaveLength(2);
  });

  it("ignores class members without @ensures", () => {
    const r = extractFromSource(CLASS_OK, "class-ok.ts");
    expect(r.annotations.some((a) => a.functionName === "value")).toBe(false);
    expect(r.annotations.some((a) => a.functionName === "secret")).toBe(false);
  });

  it("throws on @ensures on a non-public method", () => {
    expect(() => extractFromSource(CLASS_PRIVATE, "class-private.ts")).toThrow(/non-public method 'touch'/);
  });

  it("throws on @ensures on an accessor", () => {
    expect(() => extractFromSource(CLASS_ACCESSOR, "class-accessor.ts")).toThrow(/unsupported member 'value'/);
  });

  it("throws on @ensures on a method of a non-exported class", () => {
    expect(() => extractFromSource(CLASS_UNEXPORTED, "class-unexported.ts")).toThrow(/which is not exported/);
  });

  it("throws on a duplicate qualified property name", () => {
    expect(() => extractFromSource(CLASS_DUP, "class-dup.ts")).toThrow(/duplicate property name 'p' on method 'Box\.id'/);
  });

  it("throws on @ensures on a method of an anonymous class", () => {
    const src = `export default class {
  /** @ensures{p} (x: int) => x === x */
  m(x: number): number { return x; }
}
`;
    expect(() => extractFromSource(src, "anon.ts")).toThrow(/anonymous class/);
  });

  it("reports a constructor as 'constructor' when @ensures sits on it", () => {
    const src = `export class Box {
  /** @ensures{p} (x: int) => x === x */
  constructor(readonly n: number) {}
}
`;
    expect(() => extractFromSource(src, "ctor.ts")).toThrow(/unsupported member 'constructor'/);
  });

  it("reports a computed-name member as '<computed>' when @ensures sits on it", () => {
    const src = `export class Box {
  /** @ensures{p} (x: int) => x === x */
  [Symbol.iterator](): number { return 0; }
}
`;
    expect(() => extractFromSource(src, "computed.ts")).toThrow(/unsupported member '<computed>'/);
  });
});

const ARROW_EXPORT = `/** @ensures{idArrow} (x: int) => foo(x) === x */
export const foo = (x: number): number => x;

/** @ensures{idFn} (x: int) => bar(x) === x */
export const bar = function (x: number): number { return x; };
`;

const REEXPORT = `function foo(x: number): number { return x; }
function bar(x: number): number { return x; }
export { foo, bar };
`;

describe("extract — variable and re-export forms", () => {
  it("reads @ensures on arrow- and function-expression consts", () => {
    const r = extractFromSource(ARROW_EXPORT, "arrow.ts");
    expect(r.annotations.map((a) => a.functionName).sort()).toEqual(["bar", "foo"]);
    expect([...r.exports].sort()).toEqual(["bar", "foo"]);
  });

  it("collects names from an `export { ... }` declaration", () => {
    const r = extractFromSource(REEXPORT, "reexport.ts");
    expect([...r.exports].sort()).toEqual(["bar", "foo"]);
  });
});
