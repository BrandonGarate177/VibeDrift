/**
 * Per-language import regexes for the classifiers, as named, individually
 * testable constants (the #70 review lesson). AST-backed classifiers use these
 * only as the regex fallback; JS/TS is line-based for now.
 */

// ─── JS / TS ───

/** A value import line (`import ...`), excluding `import type`. Test against a trimmed line. */
export const JS_IMPORT_LINE = /^import\s+(?!type\s)/;
/** The module specifier in a `from "..."` / `from '...'` clause → capture [1]. */
export const JS_FROM_SPECIFIER = /from\s+["']([^"']+)["']/;
/** A CommonJS `require("…")` / `require('…')` call → capture [1] = specifier.
 *  Global (for `matchAll`) — a line may hold more than one require. */
export const JS_REQUIRE = /require\(\s*["']([^"']+)["']\s*\)/g;

// ─── Go (regex fallback for the `grouping` axis) ───

/** Start of a block import: `import (`. */
export const GO_IMPORT_BLOCK_START = /^\s*import\s*\(/;
/** End of a block import: a line whose first non-space char is `)`. */
export const GO_IMPORT_BLOCK_END = /^\s*\)/;
/** A quoted import path inside a spec line → capture [1] (double) or [2] (raw backtick). */
export const GO_IMPORT_PATH = /"([^"]+)"|`([^`]+)`/;
/** A single-line import: `import "fmt"`, `import _ "x"`, `import . "x"`,
 *  `import alias "x"` → capture [1] = path. Never matches `import (`. */
export const GO_IMPORT_SINGLE = /^\s*import\s+(?:(?:[A-Za-z_]\w*|\.|_)\s+)?["`]([^"`]+)["`]/;

// ─── Python (path_style axis) ───

/** `from .x` / `from ..x` / `from . import ...` — a relative import (leading dot). */
export const PY_FROM_RELATIVE = /^\s*from\s+\./;
/** `from a.b.c import ...` — an absolute from-import → capture [1] = dotted module path. */
export const PY_FROM_ABSOLUTE = /^\s*from\s+([A-Za-z_][\w.]*)\s+import/;
/** Any `from X import …` line (relative or absolute). */
export const PY_FROM_ANY = /^\s*from\s+\S+\s+import\s+/;
/** A wildcard from-import: `from X import *`. */
export const PY_WILDCARD = /^\s*from\s+\S+\s+import\s+\*/;

// ─── Rust (glob + use-path-style axes) ───

/** A `use` declaration line, optionally with any visibility — `pub use`,
 *  `pub(crate) use`, `pub(super) use`, `pub(in path) use`. */
export const RUST_USE = /^\s*(?:pub(?:\s*\([^)]*\))?\s+)?use\s+/;
/** A glob `use` — `use …::*`. */
export const RUST_USE_GLOB = /use\s[^;]*::\*/;
/** The head segment of a `use` path → capture [1] (`crate` | `super` | `self` | a crate name).
 *  Tolerates any visibility prefix (`pub`, `pub(crate)`, …). */
export const RUST_USE_HEAD = /^\s*(?:pub(?:\s*\([^)]*\))?\s+)?use\s+(\w+)/;
