/**
 * Reading and writing `.vibedriftignore` — the project's list of paths to skip
 * during a scan. Uses gitignore syntax and is honored by BOTH `vibedrift scan`
 * and the MCP server, because both go through `loadGitignore` in file
 * discovery (see `src/utils/gitignore.ts`).
 *
 * Edited by `vibedrift ignore <glob>` (quick append) and `vibedrift init`
 * (guided setup). Merges are idempotent: a pattern already present is reported
 * as skipped, never duplicated.
 */
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

export const IGNORE_FILENAME = ".vibedriftignore";

const HEADER = `# VibeDrift scan exclusions (gitignore syntax).
# Paths here are skipped by \`vibedrift scan\` and the MCP server, so they
# don't count toward your Vibe Drift Score. Created/edited by
# \`vibedrift init\` and \`vibedrift ignore\`. Docs: https://vibedrift.ai/guide
`;

export interface MergeResult {
  /** Full file content to write. */
  content: string;
  /** Patterns newly added (not previously present). */
  added: string[];
  /** Patterns skipped because they were already present. */
  skipped: string[];
}

/**
 * Merge `patterns` into an existing `.vibedriftignore` body (or null for a new
 * file). Pure — no I/O. Comment and blank lines are preserved; existing
 * non-comment patterns are treated as already-present. Input patterns are
 * trimmed and de-duplicated, order preserved.
 */
export function mergeIgnorePatterns(existing: string | null, patterns: string[]): MergeResult {
  const hasExisting = existing != null && existing.trim().length > 0;
  const present = new Set(
    (existing ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#")),
  );

  const added: string[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const raw of patterns) {
    const pattern = raw.trim();
    if (!pattern || seen.has(pattern)) continue;
    seen.add(pattern);
    if (present.has(pattern)) {
      skipped.push(pattern);
      continue;
    }
    added.push(pattern);
    present.add(pattern);
  }

  let content: string;
  if (!hasExisting) {
    content = HEADER + (added.length ? added.join("\n") + "\n" : "");
  } else {
    let base = existing as string;
    if (!base.endsWith("\n")) base += "\n";
    content = base + (added.length ? added.join("\n") + "\n" : "");
  }

  return { content, added, skipped };
}

export interface AppendResult extends MergeResult {
  /** Absolute path to the `.vibedriftignore` file. */
  path: string;
  /** Whether the file was actually written (only when something changed). */
  wrote: boolean;
}

/**
 * Append patterns to `<rootDir>/.vibedriftignore`, creating it (with a header)
 * if absent. Only writes when at least one pattern is new — calling it with
 * patterns already present is a no-op on disk.
 */
export async function appendIgnorePatterns(
  rootDir: string,
  patterns: string[],
): Promise<AppendResult> {
  const path = join(rootDir, IGNORE_FILENAME);
  let existing: string | null = null;
  try {
    existing = await readFile(path, "utf-8");
  } catch {
    // No file yet — mergeIgnorePatterns will seed the header.
  }
  const merged = mergeIgnorePatterns(existing, patterns);
  const wrote = merged.added.length > 0;
  if (wrote) {
    await writeFile(path, merged.content, "utf-8");
  }
  return { ...merged, path, wrote };
}
