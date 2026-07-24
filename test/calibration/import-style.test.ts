/**
 * Calibration gate for multi-language import-style drift (#56 acceptance
 * criterion). Runs as part of `npm test`. For each new-language axis it proves
 * the two required behaviors against a realistic corpus routed through the real
 * detector: FIRES on a mixed-convention directory (citing the deviator), and
 * stays SILENT (flags no specific file) when a directory has no dominant
 * convention.
 */

import { describe, it, expect } from "vitest";
import { importConsistency } from "../../src/drift/import-consistency.js";
import { fileWithTree } from "../helpers/drift-tree.js";
import type { BaselineFile } from "./baseline.js";
import type { DriftContext } from "../../src/drift/types.js";
import type { SupportedLanguage } from "../../src/core/types.js";
import {
  goGroupingMixed, goGroupingSplit, goDeviatorPath,
  goOrderingMixed, goOrderingSplit, goOrderingDeviatorPath,
  pyPathStyleMixed, pyPathStyleSplit, pyDeviatorPath,
  pyWildcardMixed, pyWildcardSplit, pyWildcardDeviatorPath,
  rustGlobMixed, rustGlobSplit, rustDeviatorPath,
  rustUsePathMixed, rustUsePathSplit, rustUsePathDeviatorPath,
  rustGroupingMixed, rustGroupingSplit, rustGroupingDeviatorPath,
} from "./import-style-fixture.js";

async function ctxFor(files: BaselineFile[], lang: SupportedLanguage): Promise<DriftContext> {
  const driftFiles = await Promise.all(files.map((f) => fileWithTree(f.path, f.content, lang)));
  return {
    files: driftFiles,
    totalLines: driftFiles.reduce((s, f) => s + f.lineCount, 0),
    dominantLanguage: lang,
  };
}

function forAxis(ctx: DriftContext, sub: string) {
  return importConsistency.detect(ctx).filter((f) => f.subCategory === sub);
}

const CASES = [
  { name: "Go grouping", axis: "go_grouping", dominant: "grouped", mixed: goGroupingMixed, split: goGroupingSplit, deviator: goDeviatorPath, lang: "go" as const },
  { name: "Go ordering", axis: "go_ordering", dominant: "sorted", mixed: goOrderingMixed, split: goOrderingSplit, deviator: goOrderingDeviatorPath, lang: "go" as const },
  { name: "Python path style", axis: "py_path_style", dominant: "relative", mixed: pyPathStyleMixed, split: pyPathStyleSplit, deviator: pyDeviatorPath, lang: "python" as const },
  { name: "Python wildcard", axis: "py_wildcard", dominant: "explicit", mixed: pyWildcardMixed, split: pyWildcardSplit, deviator: pyWildcardDeviatorPath, lang: "python" as const },
  { name: "Rust glob", axis: "rust_glob", dominant: "explicit", mixed: rustGlobMixed, split: rustGlobSplit, deviator: rustDeviatorPath, lang: "rust" as const },
  { name: "Rust use path", axis: "rust_use_path", dominant: "crate", mixed: rustUsePathMixed, split: rustUsePathSplit, deviator: rustUsePathDeviatorPath, lang: "rust" as const },
  { name: "Rust grouping", axis: "rust_grouping", dominant: "grouped", mixed: rustGroupingMixed, split: rustGroupingSplit, deviator: rustGroupingDeviatorPath, lang: "rust" as const },
];

for (const c of CASES) {
  describe(`import-style calibration: ${c.name}`, () => {
    it("FIRES on a mixed-convention directory and cites the deviator", async () => {
      const findings = forAxis(await ctxFor(c.mixed(), c.lang), c.axis);
      expect(findings).toHaveLength(1);
      expect(findings[0].dominantPattern.toLowerCase()).toContain(c.dominant);
      expect(findings[0].deviatingFiles.map((d) => d.path)).toContain(c.deviator);
    });

    it("stays SILENT (flags no specific file) when there is no dominant convention", async () => {
      const findings = forAxis(await ctxFor(c.split(), c.lang), c.axis);
      // Non-vacuity: the files WERE recognized (the detector emits the
      // category-level "no dominant convention" advisory), and it flags NO
      // specific file as a deviator — no false drift accusation.
      expect(findings.length).toBeGreaterThan(0);
      expect(findings.every((f) => f.deviatingFiles.length === 0)).toBe(true);
    });
  });
}
