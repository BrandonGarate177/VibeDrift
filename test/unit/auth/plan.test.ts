import { describe, it, expect } from "vitest";
import { isPaidPlan, isPeerGroundedEntitled } from "../../../src/auth/plan.js";

describe("isPaidPlan", () => {
  it("is true only for pro and enterprise", () => {
    expect(isPaidPlan("pro")).toBe(true);
    expect(isPaidPlan("enterprise")).toBe(true);
  });
  it("is false for free / null / undefined", () => {
    expect(isPaidPlan("free")).toBe(false);
    expect(isPaidPlan(null)).toBe(false);
    expect(isPaidPlan(undefined)).toBe(false);
  });
});

describe("isPeerGroundedEntitled", () => {
  it("is true only for paid plans (mirrors isPaidPlan)", () => {
    expect(isPeerGroundedEntitled("pro")).toBe(true);
    expect(isPeerGroundedEntitled("enterprise")).toBe(true);
  });
  it("is false for free / null / undefined", () => {
    expect(isPeerGroundedEntitled("free")).toBe(false);
    expect(isPeerGroundedEntitled(null)).toBe(false);
    expect(isPeerGroundedEntitled(undefined)).toBe(false);
  });
  it("can never diverge from isPaidPlan", () => {
    for (const p of ["free", "pro", "enterprise", null, undefined] as const) {
      expect(isPeerGroundedEntitled(p)).toBe(isPaidPlan(p));
    }
  });
});
