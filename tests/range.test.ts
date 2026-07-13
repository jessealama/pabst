import { describe, it, expect, vi } from "vitest";
import { parseRange, isNumericDomain } from "../src/range.js";
import { expectPabstError } from "./helpers/errors.js";

describe("parseRange — accepted", () => {
  it("parses a closed int interval", () => {
    expect(parseRange("[1, 30]", "int")).toEqual({ min: "1", max: "30" });
  });

  it("parses signed int endpoints, stripping a leading +", () => {
    expect(parseRange("[-10, +10]", "int")).toEqual({ min: "-10", max: "10" });
  });

  it("parses decimal and scientific number endpoints verbatim", () => {
    expect(parseRange("[0.5, 1e6]", "number")).toEqual({
      min: "0.5",
      max: "1e6",
    });
  });

  it("strips redundant leading zeros, which would be SyntaxErrors when emitted", () => {
    expect(parseRange("[010, 20]", "int")).toEqual({ min: "10", max: "20" });
    expect(parseRange("[090, 100]", "nat")).toEqual({ min: "90", max: "100" });
    expect(parseRange("[010n, 20n]", "bigint")).toEqual({
      min: "10",
      max: "20",
    });
    expect(parseRange("[008.5, 9]", "number")).toEqual({
      min: "8.5",
      max: "9",
    });
    expect(parseRange("[00, 5]", "int")).toEqual({ min: "0", max: "5" });
  });

  it("keeps -0 intact when stripping leading zeros", () => {
    expect(parseRange("[-00, 0]", "number")).toEqual({ min: "-0", max: "0" });
  });

  it("strips a leading + from number endpoints like the other domains", () => {
    expect(parseRange("[+0.5, 1]", "number")).toEqual({ min: "0.5", max: "1" });
  });

  it("parses a degenerate single-point interval", () => {
    expect(parseRange("[5, 5]", "int")).toEqual({ min: "5", max: "5" });
  });

  it("accepts and strips the n suffix on bigint endpoints", () => {
    expect(parseRange("[0n, 100n]", "bigint")).toEqual({
      min: "0",
      max: "100",
    });
    expect(parseRange("[0, 100]", "bigint")).toEqual({ min: "0", max: "100" });
  });

  it("accepts intervals where -0 is a genuine lower bound", () => {
    expect(parseRange("[-0, 0]", "number")).toEqual({ min: "-0", max: "0" });
    expect(parseRange("[-0, -0]", "number")).toEqual({ min: "-0", max: "-0" });
  });

  it("accepts a negative-only nat bound of zero", () => {
    expect(parseRange("[0, 30]", "nat")).toEqual({ min: "0", max: "30" });
  });
});

describe("parseRange — rejected", () => {
  it("rejects inverted intervals", () => {
    expectPabstError(() => parseRange("[30, 1]", "int"), /empty interval/);
    expectPabstError(
      () => parseRange("[0.2, 0.1]", "number"),
      /empty interval/,
    );
  });

  it("rejects [0, -0]-style intervals, following fast-check's -0 < 0 ordering", () => {
    expectPabstError(() => parseRange("[0, -0]", "number"), /empty interval/);
    expectPabstError(() => parseRange("[+0, -0]", "number"), /empty interval/);
    // 1e-400 underflows to +0, so this is [0, -0] in disguise.
    expectPabstError(
      () => parseRange("[1e-400, -0]", "number"),
      /empty interval/,
    );
    expectPabstError(() => parseRange("[0, -0]", "number"), /-0 below 0/);
  });

  it("accepts negative nat lower bounds, which clamp to 0 like (-∞ does", () => {
    expect(parseRange("[-1, 5]", "nat")).toEqual({ min: "-1", max: "5" });
    expect(parseRange("(-5, 3]", "nat")).toEqual({
      min: "-5",
      max: "3",
      minOpen: true,
    });
  });

  it("rejects nat intervals lying entirely below 0", () => {
    expectPabstError(() => parseRange("[-5, -2]", "nat"), /empty interval/);
  });

  it("rejects non-integer endpoints for int", () => {
    expectPabstError(
      () => parseRange("[1.5, 3]", "int"),
      /not an integer literal/,
    );
  });

  it("clamps unsafe integer endpoints to the safe range with a warning", () => {
    const warnings: string[] = [];
    const spy = vi
      .spyOn(console, "error")
      .mockImplementation((m: string) => void warnings.push(m));
    try {
      expect(parseRange("[0, 99999999999999999999]", "int")).toEqual({
        min: "0",
        max: "99999999999999999999",
      });
      expect(warnings.join("\n")).toMatch(/warning:.*safe integer/);
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects intervals lying entirely outside the safe integer range", () => {
    expectPabstError(
      () => parseRange("[9007199254740992, 99999999999999999999]", "int"),
      /empty interval.*safe integer/s,
    );
  });

  it("rejects non-finite or malformed number endpoints", () => {
    expectPabstError(() => parseRange("[0, 1e400]", "number"), /finite number/);
    expectPabstError(() => parseRange("[0, NaN]", "number"), /finite number/);
  });

  it("rejects the n suffix on non-bigint domains", () => {
    expectPabstError(
      () => parseRange("[0n, 5n]", "int"),
      /not an integer literal/,
    );
  });

  it("rejects intervals on non-numeric domains", () => {
    expectPabstError(() => parseRange("[1, 2]", "boolean"), /does not support/);
    expectPabstError(() => parseRange("[1, 2]", "string"), /does not support/);
  });

  it("rejects a missing or extra endpoint", () => {
    expectPabstError(() => parseRange("[1]", "int"), /two endpoints/);
    expectPabstError(() => parseRange("[1, 2, 3]", "int"), /two endpoints/);
  });

  it("rejects trailing text after the interval without blaming open bounds", () => {
    let message = "";
    try {
      parseRange("[1, 30] oops", "int");
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/unexpected text after interval/);
    expect(message).not.toMatch(/closed bounds/);
  });

  it("rejects text that is not an interval at all", () => {
    expectPabstError(() => parseRange("hello", "int"), /expected interval/);
    expectPabstError(() => parseRange("", "int"), /expected interval/);
  });
});

describe("parseRange — open and half-open intervals", () => {
  it("parses a half-open number interval (0, 1]", () => {
    expect(parseRange("(0, 1]", "number")).toEqual({
      min: "0",
      max: "1",
      minOpen: true,
    });
  });

  it("parses a half-open number interval [0, 1)", () => {
    expect(parseRange("[0, 1)", "number")).toEqual({
      min: "0",
      max: "1",
      maxOpen: true,
    });
  });

  it("parses a fully open int interval, keeping the literals verbatim", () => {
    expect(parseRange("(0, 10)", "int")).toEqual({
      min: "0",
      max: "10",
      minOpen: true,
      maxOpen: true,
    });
  });

  it("parses an open bigint interval with n-suffixed endpoints", () => {
    expect(parseRange("(0n, 100n]", "bigint")).toEqual({
      min: "0",
      max: "100",
      minOpen: true,
    });
  });

  it("accepts a nat interval whose open lower endpoint is -1", () => {
    expect(parseRange("(-1, 5]", "nat")).toEqual({
      min: "-1",
      max: "5",
      minOpen: true,
    });
  });

  it("normalizes open endpoints like closed ones", () => {
    expect(parseRange("(+0.5, 010)", "number")).toEqual({
      min: "0.5",
      max: "10",
      minOpen: true,
      maxOpen: true,
    });
  });
});

describe("parseRange — open-interval rejections", () => {
  it("rejects integer intervals that contain no integer", () => {
    expectPabstError(() => parseRange("(3, 4)", "int"), /empty interval/);
    expectPabstError(() => parseRange("(5, 5]", "int"), /empty interval/);
    expectPabstError(() => parseRange("[5, 5)", "int"), /empty interval/);
    expectPabstError(() => parseRange("(0n, 1n)", "bigint"), /empty interval/);
  });

  it("rejects number intervals with equal endpoints and an open bound", () => {
    expectPabstError(() => parseRange("(1, 1)", "number"), /empty interval/);
    expectPabstError(() => parseRange("[1, 1)", "number"), /empty interval/);
    expectPabstError(() => parseRange("(1, 1]", "number"), /empty interval/);
  });

  it("treats -0 and 0 as distinct doubles, following fast-check: (-0, 0] and [-0, 0) are singletons", () => {
    expect(parseRange("(-0, 0]", "number")).toEqual({
      min: "-0",
      max: "0",
      minOpen: true,
    });
    expect(parseRange("[-0, 0)", "number")).toEqual({
      min: "-0",
      max: "0",
      maxOpen: true,
    });
    expectPabstError(() => parseRange("(-0, 0)", "number"), /empty interval/);
  });

  it("rejects open intervals between adjacent doubles: excluding both endpoints leaves nothing", () => {
    expectPabstError(
      () => parseRange("(0, 5e-324)", "number"),
      /empty interval/,
    );
  });

  it("rejects a half-open interval with trailing text", () => {
    expectPabstError(
      () => parseRange("(0, 1] oops", "number"),
      /unexpected text after interval/,
    );
  });
});

describe("parseRange — unbounded endpoints", () => {
  it("parses (0, ∞) for number, excluding the infinity", () => {
    expect(parseRange("(0, ∞)", "number")).toEqual({
      min: "0",
      minOpen: true,
      maxOpen: true,
    });
  });

  it("parses closed ∞ endpoints for number: Infinity is a value there", () => {
    expect(parseRange("[0, ∞]", "number")).toEqual({ min: "0" });
    expect(parseRange("[-∞, 0]", "number")).toEqual({ max: "0" });
    expect(parseRange("[-∞, ∞]", "number")).toEqual({});
    expect(parseRange("[0, Infinity]", "number")).toEqual({ min: "0" });
  });

  it("accepts the ASCII Infinity spelling and a redundant +", () => {
    expect(parseRange("(0, Infinity)", "number")).toEqual({
      min: "0",
      minOpen: true,
      maxOpen: true,
    });
    expect(parseRange("(0, +∞)", "number")).toEqual({
      min: "0",
      minOpen: true,
      maxOpen: true,
    });
    expect(parseRange("(-Infinity, 0]", "int")).toEqual({
      max: "0",
      minOpen: true,
    });
  });

  it("parses unbounded integer intervals when the ∞ endpoint is open", () => {
    expect(parseRange("(0, ∞)", "int")).toEqual({
      min: "0",
      minOpen: true,
      maxOpen: true,
    });
    expect(parseRange("(-∞, 5]", "int")).toEqual({ max: "5", minOpen: true });
    expect(parseRange("(-∞, ∞)", "bigint")).toEqual({
      minOpen: true,
      maxOpen: true,
    });
  });

  it("allows an unbounded nat lower endpoint (clamped to 0 at lowering)", () => {
    expect(parseRange("(-∞, 5]", "nat")).toEqual({ max: "5", minOpen: true });
  });

  it("rejects closed ∞ endpoints for int, nat, and bigint", () => {
    expectPabstError(() => parseRange("[0, ∞]", "int"), /must be open/);
    expectPabstError(() => parseRange("[-∞, 5]", "nat"), /must be open/);
    expectPabstError(() => parseRange("[0n, ∞]", "bigint"), /must be open/);
  });

  it("rejects ∞ on the wrong side", () => {
    expectPabstError(
      () => parseRange("(∞, 5]", "int"),
      /lower endpoint cannot be \+∞/,
    );
    expectPabstError(
      () => parseRange("[0, -∞)", "number"),
      /upper endpoint cannot be -∞/,
    );
  });

  it("rejects nat intervals that are empty over the naturals", () => {
    expectPabstError(() => parseRange("(-∞, -1]", "nat"), /empty interval/);
  });

  it("rejects an open endpoint whose ±1 adjustment leaves the safe range", () => {
    expectPabstError(
      () => parseRange("(9007199254740991, ∞)", "int"),
      /safe integer/,
    );
  });

  it("still rejects overflowing and malformed number literals", () => {
    expectPabstError(() => parseRange("[0, 1e400]", "number"), /finite number/);
    expectPabstError(() => parseRange("[0, NaN]", "number"), /finite number/);
  });
});

describe("isNumericDomain", () => {
  it("classifies every domain", () => {
    expect(isNumericDomain("int")).toBe(true);
    expect(isNumericDomain("nat")).toBe(true);
    expect(isNumericDomain("number")).toBe(true);
    expect(isNumericDomain("bigint")).toBe(true);
    expect(isNumericDomain("boolean")).toBe(false);
    expect(isNumericDomain("string")).toBe(false);
  });
});
