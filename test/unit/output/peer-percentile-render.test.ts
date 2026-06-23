import { describe, it, expect } from "vitest";
import { renderTerminalOutput } from "../../../src/output/terminal.js";
import type { ScanResult } from "../../../src/core/types.js";

/**
 * Minimal ScanResult sufficient for renderTerminalOutput to run. The
 * peer-percentile line reads `percentile`, `peerLanguage`, and `plan`; the
 * rest is filler the renderer needs to not throw.
 */
function mkResult(overrides: Partial<ScanResult>): ScanResult {
  const emptyCat = { score: 20, maxScore: 20, locked: false, findingCount: 0, applicable: true };
  return {
    context: {
      rootDir: "/tmp/proj",
      dominantLanguage: "typescript",
      languageBreakdown: new Map(),
      totalLines: 100,
      files: [],
      intentHints: [],
    },
    compositeScore: 82,
    maxCompositeScore: 100,
    percentile: 73,
    peerLanguage: "typescript",
    scores: {
      architecturalConsistency: { ...emptyCat },
      redundancy: { ...emptyCat },
      dependencyHealth: { ...emptyCat, applicable: false },
      securityPosture: { ...emptyCat, applicable: false },
      intentClarity: { ...emptyCat, applicable: false },
    },
    hygieneScore: 90,
    maxHygieneScore: 0,
    hygieneScores: {},
    findings: [],
    driftFindings: [],
    driftScores: {},
    perFileScores: new Map(),
    teaseMessages: [],
    deepInsights: [],
    scanTimeMs: 5,
    ...overrides,
  } as unknown as ScanResult;
}

describe("peer-percentile render gate", () => {
  it("renders the real percentile line for a Pro plan when data is present", () => {
    const out = renderTerminalOutput(mkResult({}), { plan: "pro" });
    expect(out).toContain("Peer percentile:");
    expect(out).toContain("lower drift than 73% of comparable typescript repos");
    // No locked teaser when entitled.
    expect(out).not.toContain("🔒 Peer percentile (Pro)");
  });

  it("renders the locked teaser for a Free plan when data is present", () => {
    const out = renderTerminalOutput(mkResult({}), { plan: "free" });
    expect(out).toContain("🔒 Peer percentile (Pro)");
    expect(out).toContain("upgrade at vibedrift.ai");
    // No real percentile line for the free plan.
    expect(out).not.toContain("lower drift than 73%");
  });

  it("renders nothing about peer percentile when there is no corpus data (null)", () => {
    // The placeholder-artifact case: even Pro and Free render no percentile line,
    // so we never tease a capability that currently returns nothing.
    const pro = renderTerminalOutput(mkResult({ percentile: null }), { plan: "pro" });
    const free = renderTerminalOutput(mkResult({ percentile: null }), { plan: "free" });
    for (const out of [pro, free]) {
      expect(out).not.toContain("Peer percentile:");
      expect(out).not.toContain("🔒 Peer percentile (Pro)");
    }
  });
});
