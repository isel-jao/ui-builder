import { describe, expect, it } from "vitest";

import { serialize } from "./index";

describe("serialize", () => {
  it("returns strings unchanged", () => {
    expect(serialize("hello")).toBe("hello");
    expect(serialize("")).toBe("");
  });

  it("returns an empty string for null and undefined", () => {
    expect(serialize(null)).toBe("");
    expect(serialize(undefined)).toBe("");
  });

  it("stringifies numbers", () => {
    expect(serialize(42)).toBe("42");
    expect(serialize(0)).toBe("0");
    expect(serialize(-3.14)).toBe("-3.14");
    expect(serialize(NaN)).toBe("NaN");
    expect(serialize(Infinity)).toBe("Infinity");
  });

  it("stringifies booleans", () => {
    expect(serialize(true)).toBe("true");
    expect(serialize(false)).toBe("false");
  });

  it("stringifies arrays", () => {
    expect(serialize([1, 2, 3])).toBe("1,2,3");
    expect(serialize([])).toBe("");
  });

  it("stringifies plain objects", () => {
    expect(serialize({})).toBe("[object Object]");
  });

  it("respects a custom toString implementation", () => {
    const custom = { toString: () => "custom-value" };
    expect(serialize(custom)).toBe("custom-value");
  });

  it("stringifies dates", () => {
    const date = new Date("2024-01-01T00:00:00.000Z");
    expect(serialize(date)).toBe(date.toString());
  });

  it("stringifies symbols", () => {
    expect(serialize(Symbol("id"))).toBe("Symbol(id)");
  });

  it("stringifies functions to their source", () => {
    const fn = function greet() {};
    expect(serialize(fn)).toBe(fn.toString());
  });
});
