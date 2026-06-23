import { describe, it, expect } from "vitest";
import { compositeToPercentile, scorePercentiles } from "../../../src/scoring/engine.js";
import type { ScorePercentiles } from "../../../src/core/types.js";

/**
 * A small synthetic distribution for one language. The CLI lookup only reads
 * `n` + `scores`; the other fields are present to honor the frozen schema.
 */
function synthDist(language: string, scores: number[]): ScorePercentiles {
  return {
    corpus_version: "test",
    scoring_version: "v4",
    generated: { elite_n: scores.length, negative_n: 0 },
    languages: {
      [language]: {
        n: scores.length,
        scores,
        percentiles: { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0 },
        strata: {},
        folds: { train: { n: 0, scores: [] }, heldout: { n: 0, scores: [] } },
      },
    },
  };
}

describe("compositeToPercentile", () => {
  it("returns null for the shipped placeholder artifact (empty languages)", () => {
    // The bundled artifact has no language cohorts yet (corpus build pending),
    // so every lookup must gracefully return null (renderer shows nothing).
    expect(scorePercentiles.languages).toEqual({});
    expect(compositeToPercentile(82, "typescript")).toBeNull();
    expect(compositeToPercentile(0, "python")).toBeNull();
    expect(compositeToPercentile(100, "rust")).toBeNull();
  });

  it("returns null when the distribution is undefined", () => {
    expect(compositeToPercentile(50, "typescript", undefined)).toBeNull();
  });

  it("returns null for an unknown language", () => {
    const dist = synthDist("typescript", [10, 20, 30, 40, 50]);
    expect(compositeToPercentile(30, "go", dist)).toBeNull();
  });

  it("returns null when the language cohort is empty (n=0)", () => {
    const dist = synthDist("typescript", []);
    // synthDist sets n to scores.length (0 here).
    expect(compositeToPercentile(30, "typescript", dist)).toBeNull();
  });

  it("computes the ECDF percentile via (count <= score) / n * 100", () => {
    const dist = synthDist("typescript", [10, 20, 30, 40, 50]); // n = 5

    // 30 -> 3 of 5 scores are <= 30 -> 60
    expect(compositeToPercentile(30, "typescript", dist)).toBe(60);
    // 50 -> all 5 scores <= 50 -> 100
    expect(compositeToPercentile(50, "typescript", dist)).toBe(100);
    // 5 -> 0 scores <= 5 -> 0
    expect(compositeToPercentile(5, "typescript", dist)).toBe(0);
    // 25 -> {10,20} <= 25 -> 2/5 -> 40
    expect(compositeToPercentile(25, "typescript", dist)).toBe(40);
    // 100 (above the max) -> all 5 -> 100 (clamped)
    expect(compositeToPercentile(100, "typescript", dist)).toBe(100);
  });

  it("counts exact ties as <= (inclusive upper bound)", () => {
    const dist = synthDist("typescript", [10, 20, 20, 20, 50]); // n = 5
    // 20 -> {10,20,20,20} <= 20 -> 4/5 -> 80
    expect(compositeToPercentile(20, "typescript", dist)).toBe(80);
  });

  it("rounds to one decimal place", () => {
    const dist = synthDist("python", [1, 2, 3]); // n = 3
    // 2 -> 2/3 -> 66.666... -> 66.7
    expect(compositeToPercentile(2, "python", dist)).toBe(66.7);
  });

  it("matches a linear-scan reference implementation across many inputs", () => {
    const scores = [12.3, 18.0, 41.5, 41.5, 60.2, 77.9, 90.0, 99.9];
    const dist = synthDist("rust", scores);
    const n = scores.length;
    const ref = (x: number) =>
      Math.round((scores.filter((s) => s <= x).length / n) * 1000) / 10;
    for (const x of [0, 12.3, 30, 41.5, 41.6, 78, 90, 99.9, 100]) {
      expect(compositeToPercentile(x, "rust", dist)).toBe(ref(x));
    }
  });
});
