/**
 * Calibration corpora for multi-language import-style drift (#56).
 *
 * Each axis gets two directory roots:
 *   - a MIXED-convention directory (dominant pattern + one planted deviator) that
 *     must FIRE the axis finding and cite the deviator;
 *   - a NO-DOMINANT-convention directory (≈50/50) that must stay SILENT about
 *     drift (no specific file flagged) — the #56 acceptance criterion.
 */

import type { BaselineFile } from "./baseline.js";

// ─── Go grouping (stdlib vs external, blank-line separated) ───
function goFile(pkg: string, name: string, grouped: boolean): BaselineFile {
  const block = grouped
    ? `import (\n\t"fmt"\n\n\t"github.com/x/y"\n)`
    : `import (\n\t"fmt"\n\t"github.com/x/y"\n)`;
  return { path: `${pkg}/${name}.go`, content: `package ${pkg}\n\n${block}\n\nfunc ${name}() { fmt.Println(y.V) }\n` };
}
export const goGroupingMixed = (): BaselineFile[] =>
  [["a", true], ["b", true], ["c", true], ["d", true], ["e", false]].map(([n, g]) => goFile("gosvc", n as string, g as boolean));
export const goGroupingSplit = (): BaselineFile[] =>
  [["a", true], ["b", true], ["c", true], ["d", false], ["e", false], ["f", false]].map(([n, g]) => goFile("gomix", n as string, g as boolean));
export const goDeviatorPath = "gosvc/e.go";

// ─── Python path style (absolute-local vs relative) ───
function pyFile(pkg: string, name: string, relative: boolean): BaselineFile {
  const block = relative
    ? `from .models import User\nfrom ..db import session`
    : `from ${pkg}.models import User\nfrom ${pkg}.db import session`;
  return { path: `${pkg}/${name}.py`, content: `${block}\n\n\ndef ${name}():\n    return User\n` };
}
export const pyPathStyleMixed = (): BaselineFile[] =>
  [["a", true], ["b", true], ["c", true], ["d", true], ["e", false]].map(([n, r]) => pyFile("pysvc", n as string, r as boolean));
export const pyPathStyleSplit = (): BaselineFile[] =>
  [["a", true], ["b", true], ["c", true], ["d", false], ["e", false], ["f", false]].map(([n, r]) => pyFile("pymix", n as string, r as boolean));
export const pyDeviatorPath = "pysvc/e.py";

// ─── Rust glob (use …::* vs explicit) ───
function rsFile(dir: string, name: string, glob: boolean): BaselineFile {
  const second = glob ? `use crate::prelude::*;` : `use serde::Deserialize;`;
  return { path: `${dir}/${name}.rs`, content: `use std::collections::HashMap;\n${second}\n\nfn ${name}() {}\n` };
}
export const rustGlobMixed = (): BaselineFile[] =>
  [["a", false], ["b", false], ["c", false], ["d", false], ["e", true]].map(([n, g]) => rsFile("rssvc", n as string, g as boolean));
export const rustGlobSplit = (): BaselineFile[] =>
  [["a", false], ["b", false], ["c", false], ["d", true], ["e", true], ["f", true]].map(([n, g]) => rsFile("rsmix", n as string, g as boolean));
export const rustDeviatorPath = "rssvc/e.rs";

// ─── Go ordering (sorted vs unsorted within a group) ───
function goOrderFile(pkg: string, name: string, ordered: boolean): BaselineFile {
  const block = ordered
    ? `import (\n\t"bytes"\n\t"fmt"\n\t"os"\n)`
    : `import (\n\t"os"\n\t"fmt"\n\t"bytes"\n)`;
  return { path: `${pkg}/${name}.go`, content: `package ${pkg}\n\n${block}\n\nfunc ${name}() {}\n` };
}
export const goOrderingMixed = (): BaselineFile[] =>
  [["a", true], ["b", true], ["c", true], ["d", true], ["e", false]].map(([n, o]) => goOrderFile("goord", n as string, o as boolean));
export const goOrderingSplit = (): BaselineFile[] =>
  [["a", true], ["b", true], ["c", true], ["d", false], ["e", false], ["f", false]].map(([n, o]) => goOrderFile("goordmix", n as string, o as boolean));
export const goOrderingDeviatorPath = "goord/e.go";

// ─── Python wildcard (from x import * vs explicit names) ───
function pyWildFile(pkg: string, name: string, wildcard: boolean): BaselineFile {
  const block = wildcard
    ? `from ${pkg}.foo import *\nfrom ${pkg}.bar import *`
    : `from ${pkg}.foo import a\nfrom ${pkg}.bar import b`;
  return { path: `${pkg}/${name}.py`, content: `${block}\n\n\ndef ${name}():\n    return 1\n` };
}
export const pyWildcardMixed = (): BaselineFile[] =>
  [["a", false], ["b", false], ["c", false], ["d", false], ["e", true]].map(([n, w]) => pyWildFile("pywild", n as string, w as boolean));
export const pyWildcardSplit = (): BaselineFile[] =>
  [["a", false], ["b", false], ["c", false], ["d", true], ["e", true], ["f", true]].map(([n, w]) => pyWildFile("pywildmix", n as string, w as boolean));
export const pyWildcardDeviatorPath = "pywild/e.py";

// ─── Rust intra-crate use path (crate:: vs super::/self::) ───
function rsUsePathFile(dir: string, name: string, crate: boolean): BaselineFile {
  const block = crate
    ? `use crate::a::B;\nuse crate::c::D;`
    : `use super::a::B;\nuse super::c::D;`;
  return { path: `${dir}/${name}.rs`, content: `${block}\n\nfn ${name}() {}\n` };
}
export const rustUsePathMixed = (): BaselineFile[] =>
  [["a", true], ["b", true], ["c", true], ["d", true], ["e", false]].map(([n, c]) => rsUsePathFile("rspath", n as string, c as boolean));
export const rustUsePathSplit = (): BaselineFile[] =>
  [["a", true], ["b", true], ["c", true], ["d", false], ["e", false], ["f", false]].map(([n, c]) => rsUsePathFile("rspathmix", n as string, c as boolean));
export const rustUsePathDeviatorPath = "rspath/e.rs";

// ─── Rust use grouping (origin-grouped vs flat) ───
function rsGroupFile(dir: string, name: string, grouped: boolean): BaselineFile {
  const block = grouped
    ? `use std::fmt::Debug;\n\nuse crate::foo::Bar;`
    : `use std::fmt::Debug;\nuse crate::foo::Bar;`;
  return { path: `${dir}/${name}.rs`, content: `${block}\n\nfn ${name}() {}\n` };
}
export const rustGroupingMixed = (): BaselineFile[] =>
  [["a", true], ["b", true], ["c", true], ["d", true], ["e", false]].map(([n, g]) => rsGroupFile("rsgroup", n as string, g as boolean));
export const rustGroupingSplit = (): BaselineFile[] =>
  [["a", true], ["b", true], ["c", true], ["d", false], ["e", false], ["f", false]].map(([n, g]) => rsGroupFile("rsgroupmix", n as string, g as boolean));
export const rustGroupingDeviatorPath = "rsgroup/e.rs";
