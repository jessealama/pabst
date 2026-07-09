import { describe, it, expect } from "vitest";
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

  it("rejects negative nat bounds", () => {
    expectPabstError(() => parseRange("[-1, 5]", "nat"), /nat interval/);
  });

  it("rejects non-integer endpoints for int", () => {
    expectPabstError(
      () => parseRange("[1.5, 3]", "int"),
      /not an integer literal/,
    );
  });

  it("rejects unsafe integer endpoints for int", () => {
    expectPabstError(
      () => parseRange("[0, 99999999999999999999]", "int"),
      /safe integer/,
    );
  });

  it("rejects non-finite or malformed number endpoints", () => {
    expectPabstError(
      () => parseRange("[0, Infinity]", "number"),
      /finite number/,
    );
    expectPabstError(() => parseRange("[0, 1e400]", "number"), /finite number/);
    expectPabstError(() => parseRange("[0, NaN]", "number"), /finite number/);
  });

  it("rejects the n suffix on non-bigint domains", () => {
    expectPabstError(
      () => parseRange("[0n, 5n]", "int"),
      /not an integer literal/,
    );
  });

  it("rejects open/half-open notation with a closed-bounds hint", () => {
    expectPabstError(() => parseRange("[1, 30)", "int"), /closed bounds/);
    expectPabstError(() => parseRange("(0, 1]", "number"), /closed bounds/);
    expectPabstError(() => parseRange("(0, 1)", "number"), /closed bounds/);
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
