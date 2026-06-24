import { describe, it, expect } from "vitest";
import {
  parseThresholdAnswer,
  parseFormatAnswer,
  parseGlobList,
  isAffirmative,
} from "../../../src/cli/commands/init.js";

describe("parseThresholdAnswer", () => {
  it("blank means no threshold", () => {
    expect(parseThresholdAnswer("")).toEqual({ ok: true, value: undefined });
    expect(parseThresholdAnswer("   ")).toEqual({ ok: true, value: undefined });
  });
  it("accepts numbers 0-100", () => {
    expect(parseThresholdAnswer("75")).toEqual({ ok: true, value: 75 });
    expect(parseThresholdAnswer("0")).toEqual({ ok: true, value: 0 });
    expect(parseThresholdAnswer("100")).toEqual({ ok: true, value: 100 });
  });
  it("rejects out-of-range and non-numbers", () => {
    expect(parseThresholdAnswer("101").ok).toBe(false);
    expect(parseThresholdAnswer("-1").ok).toBe(false);
    expect(parseThresholdAnswer("abc").ok).toBe(false);
  });
});

describe("parseFormatAnswer", () => {
  it("recognizes valid formats (case-insensitive)", () => {
    expect(parseFormatAnswer("terminal")).toBe("terminal");
    expect(parseFormatAnswer("HTML")).toBe("html");
    expect(parseFormatAnswer("json")).toBe("json");
  });
  it("returns undefined for blank or unknown (keep default)", () => {
    expect(parseFormatAnswer("")).toBeUndefined();
    expect(parseFormatAnswer("yaml")).toBeUndefined();
  });
});

describe("parseGlobList", () => {
  it("splits, trims and drops empties", () => {
    expect(parseGlobList("a/**, b/**,, c/** ")).toEqual(["a/**", "b/**", "c/**"]);
    expect(parseGlobList("")).toEqual([]);
  });
});

describe("isAffirmative", () => {
  it("blank uses the default", () => {
    expect(isAffirmative("", true)).toBe(true);
    expect(isAffirmative("", false)).toBe(false);
  });
  it("y/yes are true, anything else false", () => {
    expect(isAffirmative("y", false)).toBe(true);
    expect(isAffirmative("YES", false)).toBe(true);
    expect(isAffirmative("n", true)).toBe(false);
    expect(isAffirmative("nope", true)).toBe(false);
  });
});
