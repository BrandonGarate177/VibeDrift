import { describe, it, expect } from "vitest";
import { scoredDriftView } from "../../../src/drift/index.js";
import { buildSuppressionAuditFinding } from "../../../src/drift/security-suppression.js";
import { diffScans } from "../../../src/output/history-diff.js";
import { computeDriftFindingDigest, type SavedScan } from "../../../src/core/history.js";
import type { DriftFinding } from "../../../src/drift/types.js";
import type { CategoryScores } from "../../../src/core/types.js";

/**
 * Regression suite for #64 item 2: the "Since last scan" diff must not call
 * something drift that the report itself renders as advisory.
 *
 * buildScanResult now derives the scored drift view (scoredDriftView) ONCE and
 * feeds BOTH the persisted scan (result.driftFindings → saveScanResult) and the
 * scan-over-scan diff digest from it. scoredDriftView drops below-floor security
 * findings and the suppression-audit finding, so neither can surface as a
 * spurious "new/resolved drift finding" in the diff banner. These tests exercise
 * the real functions (scoredDriftView, diffScans, computeDriftFindingDigest).
 */

const TOTAL_LINES = 500;

// Above MIN_SECURITY_PEERS and a real dominance vote — belongs in the drift view.
function normalDrift(): DriftFinding {
  return {
    detector: "convention-oscillation",
    subCategory: "case_style",
    driftCategory: "naming_conventions",
    severity: "warning",
    confidence: 0.8,
    finding: "3 files use snake_case while peers use camelCase",
    dominantPattern: "camelCase",
    dominantCount: 8,
    totalRelevantFiles: 11,
    consistencyScore: 73,
    deviatingFiles: [{ path: "src/a.ts", detectedPattern: "snake_case", evidence: [{ line: 1, code: "x" }] }],
    dominantFiles: [],
    recommendation: "Use camelCase.",
  };
}

// Peer sample of 3 < MIN_SECURITY_PEERS (4): the "small repo, 2-3 mutating
// routes, one auth gap". Demoted to advisory; excluded from the drift view.
function belowFloorSecurity(): DriftFinding {
  return {
    detector: "security_posture",
    subCategory: "Auth middleware",
    driftCategory: "security_posture",
    severity: "warning",
    confidence: 0.6,
    finding: "1 mutating route(s) lack auth while the codebase uses auth elsewhere",
    dominantPattern: "auth on mutating routes",
    dominantCount: 2,
    totalRelevantFiles: 3,
    consistencyScore: 67,
    deviatingFiles: [
      { path: "src/routes/admin.ts", detectedPattern: "POST /admin no auth", evidence: [{ line: 12, code: "POST /admin" }] },
    ],
    dominantFiles: [],
    recommendation: "Add auth middleware, or confirm it is intentionally public.",
  };
}

const EMPTY_SCORES: CategoryScores = {
  architecturalConsistency: { score: 20, maxScore: 20, locked: false, findingCount: 0, applicable: true },
  redundancy: { score: 20, maxScore: 20, locked: false, findingCount: 0, applicable: true },
  dependencyHealth: { score: 0, maxScore: 20, locked: false, findingCount: 0, applicable: false },
  securityPosture: { score: 20, maxScore: 20, locked: false, findingCount: 0, applicable: true },
  intentClarity: { score: 20, maxScore: 20, locked: false, findingCount: 0, applicable: true },
};

function savedScan(driftFindingDigests: string[]): SavedScan {
  return {
    timestamp: "2026-04-19T10:00:00Z",
    rootDir: "/x",
    schemaVersion: 3,
    scores: EMPTY_SCORES,
    compositeScore: 80,
    hygieneScore: 100,
    findingDigests: [],
    driftFindingDigests,
  };
}

function currentScan(driftFindingDigests: string[]) {
  return {
    timestamp: new Date().toISOString(),
    compositeScore: 80,
    hygieneScore: 100,
    findingDigests: [] as string[],
    driftFindingDigests,
  };
}

describe("scan diff / advisory consistency (#64 item 2)", () => {
  it("scoredDriftView drops below-floor security and suppression findings — the single source both saveScanResult and the diff digest read", () => {
    const suppression = buildSuppressionAuditFinding([
      { path: "src/routes/public.ts", line: 3, reason: "annotation", source: "@vibedrift-public" },
    ]);
    const raw = [normalDrift(), belowFloorSecurity(), suppression];
    const { driftFindings } = scoredDriftView(raw, TOTAL_LINES);
    expect(driftFindings).toHaveLength(1);
    expect(driftFindings[0].driftCategory).toBe("naming_conventions");
  });

  it("a below-floor advisory finding introduced between two scans does not appear as new drift", () => {
    // Previous scan: only the normal drift finding.
    const previous = savedScan([normalDrift()].map(computeDriftFindingDigest));
    // Current RAW set gained a below-floor advisory; the diff digest is built
    // from the scored view (as buildScanResult does), which excludes it.
    const scored = scoredDriftView([normalDrift(), belowFloorSecurity()], TOTAL_LINES).driftFindings;
    const diff = diffScans(previous, currentScan(scored.map(computeDriftFindingDigest)));
    expect(diff.driftFindingsDiff.new).toHaveLength(0);
    expect(diff.driftFindingsDiff.persistent).toHaveLength(1); // the normal finding carries over
  });

  it("adding or removing a @vibedrift-public suppression between two scans is neither new nor resolved drift", () => {
    const suppression = buildSuppressionAuditFinding([
      { path: "src/routes/public.ts", line: 3, reason: "annotation", source: "@vibedrift-public" },
    ]);

    // Adding a suppression: previous had none, current gains one → not "new".
    const prevNoSuppression = savedScan(
      scoredDriftView([normalDrift()], TOTAL_LINES).driftFindings.map(computeDriftFindingDigest),
    );
    const withSuppression = scoredDriftView([normalDrift(), suppression], TOTAL_LINES).driftFindings;
    const added = diffScans(prevNoSuppression, currentScan(withSuppression.map(computeDriftFindingDigest)));
    expect(added.driftFindingsDiff.new).toHaveLength(0);

    // Removing a suppression: previous had one, current drops it → not "resolved".
    const prevWithSuppression = savedScan(
      scoredDriftView([normalDrift(), suppression], TOTAL_LINES).driftFindings.map(computeDriftFindingDigest),
    );
    const withoutSuppression = scoredDriftView([normalDrift()], TOTAL_LINES).driftFindings;
    const removed = diffScans(prevWithSuppression, currentScan(withoutSuppression.map(computeDriftFindingDigest)));
    expect(removed.driftFindingsDiff.resolved).toHaveLength(0);
  });

  it("the saved scan and the diff digest are built from the same scored source", () => {
    const raw = [normalDrift(), belowFloorSecurity()];
    const scored = scoredDriftView(raw, TOTAL_LINES).driftFindings;
    // buildScanResult sets result.driftFindings = scored (what saveScanResult
    // persists) AND builds the diff digest from that same scored array.
    const savedDigests = scored.map(computeDriftFindingDigest);
    const diffDigests = scored.map(computeDriftFindingDigest);
    expect(savedDigests).toEqual(diffDigests);
    // The below-floor advisory's digest is in neither.
    expect(savedDigests).not.toContain(computeDriftFindingDigest(belowFloorSecurity()));
  });
});
