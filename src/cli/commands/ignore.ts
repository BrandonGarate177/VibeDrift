/**
 * `vibedrift ignore <glob...>` — quickly add paths to `.vibedriftignore`.
 *
 * The fast path for "stop scoring this": appends one or more globs to the
 * project's `.vibedriftignore` (gitignore syntax), creating it with a header
 * if absent. Idempotent — patterns already present are reported, not
 * duplicated. For guided setup (CI threshold, report format, hook) use
 * `vibedrift init`.
 */
import chalk from "chalk";
import { resolve } from "path";
import { appendIgnorePatterns, IGNORE_FILENAME } from "../../utils/vibedriftignore.js";
import { deletePersistedBaseline } from "../../core/baseline.js";

export interface IgnoreOptions {
  rootDir?: string;
}

export async function runIgnore(patterns: string[], opts: IgnoreOptions = {}): Promise<void> {
  const rootDir = resolve(opts.rootDir ?? ".");
  const cleaned = patterns.map((p) => p.trim()).filter(Boolean);

  if (cleaned.length === 0) {
    console.error(chalk.red("  ✗ No patterns given."));
    console.error(chalk.dim('    Usage: vibedrift ignore "**/fixtures/**" "**/*.generated.*"'));
    process.exit(1);
  }

  const result = await appendIgnorePatterns(rootDir, cleaned);

  // New exclusions change which files discovery sees, so drop any persisted
  // drift baseline (used by the MCP tools) — the next build will honor them.
  if (result.added.length > 0) {
    await deletePersistedBaseline(rootDir);
  }

  console.log("");
  if (result.added.length > 0) {
    console.log(chalk.green(`  ✓ Added ${result.added.length} pattern(s) to ${IGNORE_FILENAME}:`));
    for (const p of result.added) console.log(chalk.dim(`      ${p}`));
  }
  if (result.skipped.length > 0) {
    console.log(chalk.dim(`  Already present (skipped): ${result.skipped.join(", ")}`));
  }
  if (result.added.length > 0) {
    console.log("");
    console.log(chalk.dim(`  These paths are now skipped by scans and the MCP. Commit ${IGNORE_FILENAME} to share it.`));
  }
  console.log("");
}
