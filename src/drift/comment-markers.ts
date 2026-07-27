/**
 * Shared comment-line detection for the regex/line-based fallback paths across
 * drift detectors (security route extraction, import-style classification).
 *
 * These fallbacks match source text line by line, so a commented-out line must
 * not be mistaken for real code — e.g. a commented route becoming a phantom
 * that steals a `@vibedrift-public` annotation (#64 item 4), or a commented
 * import path being counted as a real import. JS/TS and Go share C-style
 * comments; Python differs (`#` line comments).
 */

/** Line-comment markers for C-style languages (JS, TS, Go). */
export const C_STYLE_COMMENT_MARKERS = ["//", "/*"] as const;
/** Line-comment markers for Python. */
export const PYTHON_COMMENT_MARKERS = ["#"] as const;

/** True when a source line is a line comment for any of the given markers. */
export function isCommentLine(line: string, markers: readonly string[]): boolean {
  const trimmed = line.trimStart();
  return markers.some((m) => trimmed.startsWith(m));
}

/**
 * Mark which Python lines are "non-code" — `#` comments and triple-quoted
 * docstring/string bodies (including a one-line `"""x"""`) — so the line-based
 * regex fallbacks skip imports or routes that only appear inside a comment or a
 * docstring. Shared by import-style and route-extractors so the two fallbacks
 * agree (they previously disagreed on one-line docstrings). Returns a boolean
 * per input line, `true` = non-code.
 *
 * Fallback-only heuristic (the AST paths are exact): an odd number of triple-
 * quotes on a line toggles docstring state; an even count of ≥2 is a one-line
 * docstring.
 */
export function pythonNonCodeLines(lines: string[]): boolean[] {
  const flags: boolean[] = [];
  let inDoc = false;
  for (const line of lines) {
    const triples = (line.match(/"""|'''/g) ?? []).length;
    if (inDoc) {
      flags.push(true);
      if (triples % 2 === 1) inDoc = false; // an odd count closes the docstring
      continue;
    }
    if (triples % 2 === 1) { inDoc = true; flags.push(true); continue; } // opens a multi-line docstring
    if (triples >= 2) { flags.push(true); continue; } // a `"""one-line"""` docstring
    flags.push(isCommentLine(line, PYTHON_COMMENT_MARKERS));
  }
  return flags;
}
