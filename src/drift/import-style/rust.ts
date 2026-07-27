/**
 * Rust import-style classifier — axes `rust_glob`, `rust_use_path`, `rust_grouping`.
 *
 * `rust_glob`: glob (`use foo::bar::*;`) vs explicit paths. Idiomatic globs are
 * excluded — relative (`use super::*;`, `use self::…::*;`) and external preludes
 * (`use rayon::prelude::*;`); crate-root and crate-internal globs stay flagged.
 * Decidable with a (non-idiomatic) glob present or ≥2 uses.
 *
 * `rust_use_path`: intra-crate refs written absolute (`use crate::…`) vs
 * relative (`use super::…` / `use self::…`). External-crate uses, relative
 * globs, and `pub use …` re-exports (API surface, not an import choice) are
 * neutral and ignored; ≥2 intra-crate imports to decide.
 *
 * Only **top-level** `use` declarations count — uses inside `#[cfg(test)] mod
 * tests { … }` and other nested modules follow their own conventions (e.g.
 * `use super::*;`, `use crate::test_utils::…`) and would otherwise poison the
 * file's vote. Glob detection uses the `use_wildcard` AST node so wrapped
 * (`use a::{\n b::*,\n}`) and brace-group (`use a::{self, *}`) globs are caught.
 * AST on a clean parse, regex fallback (comment/string-guarded) otherwise.
 */

import type { DriftFile, Evidence } from "../types.js";
import type { AxisClassification, ImportStyleClassifier } from "./types.js";
import { isAnalyzableSource } from "../utils.js";
import { RUST_USE, RUST_USE_GLOB, RUST_USE_HEAD, RUST_USE_REEXPORT } from "./patterns.js";
import { capEvidence, cleanTree, binaryMajority, blankBetween, groupBoundaryEvidence } from "./shared.js";

interface UseRow { start: number; end: number; text: string; full: string; isGlob: boolean; enumGlob: boolean; } // text = first line (head + display); full = whole declaration; 0-based rows

/** Head token of a `use` path (`crate` | `super` | `self` | std | a crate name), or null. */
function headOf(text: string): string | null {
  return text.match(RUST_USE_HEAD)?.[1] ?? null;
}

/** A single `use_wildcard` target whose last path segment before `::*` is
 *  UpperCamelCase — i.e. an enum/type, so `use …::SomeEnum::*` is variant
 *  scoping (an accepted idiom), not the namespace-glob anti-pattern. Rust
 *  naming (snake_case modules, CamelCase types) makes this reliable; a bare
 *  `{…, *}` glob has no `Ident::` target and reads as a module glob. */
function isEnumWildcard(wildText: string): boolean {
  const m = wildText.match(/([A-Za-z_]\w*)::\*$/);
  return !!m && /^[A-Z]/.test(m[1]);
}

/** Collect one row per **top-level** `use` declaration. Multiline uses span
 *  start→end rows; `isGlob` comes from the `use_wildcard` node (AST) or the glob
 *  regex over the full, comment-stripped declaration (fallback). */
function collectUses(file: DriftFile): UseRow[] {
  const rows: UseRow[] = [];
  const tree = cleanTree(file);
  if (tree) {
    // Direct children of source_file only — nested/test-module uses are excluded.
    for (const u of tree.rootNode.namedChildren) {
      if (!u || u.type !== "use_declaration") continue;
      const wilds = u.descendantsOfType("use_wildcard").filter((n) => n != null);
      const isGlob = wilds.length > 0;
      const enumGlob = isGlob && wilds.every((w) => isEnumWildcard(w!.text));
      rows.push({ start: u.startPosition.row, end: u.endPosition.row, text: u.text.split("\n")[0].trim(), full: u.text, isGlob, enumGlob });
    }
    return rows;
  }
  // Regex fallback (broken parse): skip block/line comments, follow a `use`
  // across continuation lines to its `;`, and detect globs on that full text.
  const lines = file.content.split("\n");
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (inBlockComment) {
      const close = line.indexOf("*/");
      if (close === -1) continue;
      line = line.slice(close + 2);
      inBlockComment = false;
    }
    let scan = line.split("//")[0]; // rust use-paths have no `//`, so this only drops comments
    const open = scan.indexOf("/*");
    if (open !== -1 && scan.indexOf("*/", open) === -1) { inBlockComment = true; scan = scan.slice(0, open); }
    if (!RUST_USE.test(scan)) continue;
    let end = i;
    let decl = scan;
    while (!decl.includes(";") && end + 1 < lines.length) { end++; decl += "\n" + lines[end].split("//")[0]; }
    const semi = decl.indexOf(";");
    if (semi !== -1) decl = decl.slice(0, semi + 1);
    // enum-variant glob: every `Ident::*` target is CamelCase and there's no bare `{…, *}` glob.
    const targets = [...decl.matchAll(/([A-Za-z_]\w*)::\*/g)].map((m) => m[1]);
    const bareGlob = /(^|[^:])\*/.test(decl);
    const isGlob = RUST_USE_GLOB.test(decl);
    const enumGlob = isGlob && !bareGlob && targets.length > 0 && targets.every((t) => /^[A-Z]/.test(t));
    rows.push({ start: i, end, text: scan.trim(), full: decl, isGlob, enumGlob });
    i = end;
  }
  return rows;
}

/** Idiomatic globs — NOT the namespace-glob anti-pattern, so the glob/use-path
 *  axes ignore them:
 *   - relative: `use super::*;` (test re-imports), `use self::…::*;` (enum scoping)
 *   - external prelude: `use rayon::prelude::*;` (preludes are designed to be glob-imported)
 *   - enum-variant scoping: `use …::SomeEnum::*;` (CamelCase target), any head
 *  Crate-root (`use crate::*;`) and crate-internal module (`use crate::foo::*;`)
 *  globs are deliberate local choices and stay flagged. */
function isIdiomaticGlob(row: UseRow): boolean {
  if (!row.isGlob) return false;
  if (row.enumGlob) return true; // `use …::Enum::*` variant scoping, regardless of head
  const head = headOf(row.text);
  if (head === "super" || head === "self") return true;
  // Test `prelude` on the FULL declaration — a wrapped `use rayon::{\n prelude::*,\n }`
  // has its glob on a continuation line, so first-line text alone would miss it.
  return head !== "crate" && /\bprelude\b/.test(row.full);
}

function glob(rows: UseRow[]): AxisClassification | null {
  // Idiomatic globs are neither the glob anti-pattern nor "explicit" — drop them.
  const relevant = rows.filter((r) => !isIdiomaticGlob(r));
  const globRows = relevant.filter((r) => r.isGlob);
  if (globRows.length === 0 && relevant.length < 2) return null;
  const evidence = capEvidence((globRows.length > 0 ? globRows : relevant).map((r) => ({ line: r.start + 1, code: r.text })));
  return { axis: "rust_glob", pattern: globRows.length > 0 ? "glob" : "explicit", evidence };
}

function usePath(rows: UseRow[]): AxisClassification | null {
  // Collect each side's evidence separately so only the winning side is shown.
  const crateEv: Evidence[] = [];
  const relativeEv: Evidence[] = [];
  for (const r of rows) {
    if (isIdiomaticGlob(r)) continue; // idiomatic glob — not a considered path-style choice
    if (RUST_USE_REEXPORT.test(r.text)) continue; // `pub use …` re-export — API surface, not an import-path choice
    const head = headOf(r.text);
    if (head === "crate") crateEv.push({ line: r.start + 1, code: r.text });
    else if (head === "super" || head === "self") relativeEv.push({ line: r.start + 1, code: r.text });
    // external crate — neutral
  }
  if (crateEv.length + relativeEv.length < 2) return null;
  const pattern = binaryMajority(crateEv.length, "crate", relativeEv.length, "relative");
  return { axis: "rust_use_path", pattern, evidence: capEvidence(pattern === "crate" ? crateEv : relativeEv) };
}

type Origin = "std" | "external" | "internal";

/** Origin of a `use` from its head token — unambiguous in Rust (no local-vs-
 *  stdlib guessing needed): crate/super/self ⇒ internal, std/core/alloc ⇒ std,
 *  anything else ⇒ an external crate. */
function useOrigin(text: string): Origin | null {
  const head = headOf(text);
  if (!head) return null;
  if (head === "crate" || head === "super" || head === "self") return "internal";
  if (head === "std" || head === "core" || head === "alloc") return "std";
  return "external";
}

/** Are uses from ≥2 origins separated by a blank line (`grouped`) or run
 *  together (`flat`)? Measured from the previous declaration's end row so a
 *  wrapped multiline `use` never fakes a boundary. rustfmt doesn't enforce
 *  import grouping by default, so this is a softer convention than gofmt's. */
function grouping(rows: UseRow[], lines: string[]): AxisClassification | null {
  if (rows.length < 2) return null;
  const origins = new Set(rows.map((r) => useOrigin(r.text)).filter((o): o is Origin => o !== null));
  if (origins.size < 2) return null;
  const sorted = [...rows].sort((a, b) => a.start - b.start);
  let grouped = false;
  for (let i = 1; i < sorted.length; i++) {
    if (blankBetween(lines, sorted[i - 1].end, sorted[i].start)) { grouped = true; break; }
  }
  const items = sorted.map((r) => ({ startRow: r.start, endRow: r.end, key: useOrigin(r.text) ?? "", line: r.start + 1, code: r.text }));
  return { axis: "rust_grouping", pattern: grouped ? "grouped" : "flat", evidence: groupBoundaryEvidence(items, lines, grouped) };
}

export const rustImportClassifier: ImportStyleClassifier = {
  classify(file: DriftFile): AxisClassification[] {
    if (!isAnalyzableSource(file.relativePath)) return [];
    const rows = collectUses(file);
    const lines = file.content.split("\n");
    const out: AxisClassification[] = [];
    const g = glob(rows);
    if (g) out.push(g);
    const u = usePath(rows);
    if (u) out.push(u);
    const gr = grouping(rows, lines);
    if (gr) out.push(gr);
    return out;
  },
};
