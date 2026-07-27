/**
 * Small helpers shared by the per-language import-style classifiers — mirrors
 * `route-extractors/shared.ts`. Kept deliberately thin: language-specific
 * collection stays in each classifier; only the genuinely identical mechanics
 * (tree-usability gate, evidence cap, binary-majority tie-break) live here.
 */

import type { Tree } from "../../core/types.js";
import type { DriftFile, Evidence } from "../types.js";

/** Max evidence snippets attached to a single classification. */
export const EVIDENCE_LIMIT = 3;

/**
 * The file's parse tree when it's usable — present and error-free — otherwise
 * `null`, which is every classifier's signal to fall back to line/regex
 * scanning. Centralizes the `file.tree && !rootNode.hasError` check (and drops
 * the `file.tree!` non-null assertions at call sites).
 */
export function cleanTree(file: DriftFile): Tree | null {
  return file.tree && !file.tree.rootNode.hasError ? file.tree : null;
}

/** Cap an evidence list at {@link EVIDENCE_LIMIT}. */
export function capEvidence(evidence: Evidence[]): Evidence[] {
  return evidence.slice(0, EVIDENCE_LIMIT);
}

/**
 * True if a genuinely blank line separates two imports/uses — the shared
 * group-boundary test for Go and Rust grouping/ordering. `from`/`to` are 0-based
 * row indices (use the previous declaration's END row so a wrapped multiline
 * `use` or a comment/attribute between declarations doesn't fake a boundary).
 */
export function blankBetween(lines: string[], from: number, to: number): boolean {
  for (let l = from + 1; l < to; l++) {
    if ((lines[l] ?? "").trim() === "") return true;
  }
  return false;
}

/**
 * Evidence that points at the grouping decision rather than just the first few
 * imports: for a `grouped` file, the pair straddling the first blank-line group
 * boundary; for a `flat` file, the first adjacent different-origin pair run
 * together with no blank. Shared by the Go and Rust `grouping` axes. Items are
 * source-ordered with `key` = origin/category. Falls back to the capped list if
 * no boundary is found (shouldn't happen once a file is decidable).
 */
export function groupBoundaryEvidence(
  items: { startRow: number; endRow: number; key: string; line: number; code: string }[],
  lines: string[],
  grouped: boolean,
): Evidence[] {
  const pair = (a: (typeof items)[number], b: (typeof items)[number]): Evidence[] => [
    { line: a.line, code: a.code },
    { line: b.line, code: b.code },
  ];
  for (let i = 1; i < items.length; i++) {
    const blank = blankBetween(lines, items[i - 1].endRow, items[i].startRow);
    if (grouped) {
      if (blank) return pair(items[i - 1], items[i]);
    } else if (!blank && items[i - 1].key !== items[i].key) {
      return pair(items[i - 1], items[i]);
    }
  }
  return capEvidence(items.map((it) => ({ line: it.line, code: it.code })));
}

/**
 * Winner of a two-way count where a file with only one side present classifies
 * as that side, and a tie breaks to the first (`a`) label. This is the shared
 * shape behind path_style (relative/alias), py_path_style (relative/absolute),
 * and rust_use_path (crate/relative).
 */
export function binaryMajority<A extends string, B extends string>(
  a: number,
  aLabel: A,
  b: number,
  bLabel: B,
): A | B {
  if (b === 0) return aLabel;
  if (a === 0) return bLabel;
  return a >= b ? aLabel : bLabel;
}
