/**
 * `vibedrift init` — guided, one-time project setup (like `eslint --init`).
 *
 * Detects likely fixture/generated paths, then asks a few questions and writes
 * `.vibedriftignore` (paths to skip) + `.vibedrift/config.json` (default report
 * format, CI score floor). Optionally installs the pre-push hook. Exclusions
 * are written ONLY on the user's say-so — detection is automatic, exclusion is
 * not. Use `--yes` to accept detected defaults non-interactively (CI/scripts).
 */
import readline from "readline";
import chalk from "chalk";
import { resolve } from "path";
import { run as runInitCore, detectExcludeCandidates } from "../../tools-core/tools/init.js";
import { IGNORE_FILENAME } from "../../utils/vibedriftignore.js";
import { projectConfigPath, type ReportFormat } from "../../core/project-config.js";
import { runHook } from "./hook.js";

export interface InitOptions {
  rootDir?: string;
  /** Accept detected defaults without prompting (non-interactive). */
  yes?: boolean;
}

const VALID_FORMATS: ReportFormat[] = ["html", "terminal", "json", "csv", "docx"];

/** Parse a CI-threshold answer. Blank → no threshold. Out-of-range → invalid. */
export function parseThresholdAnswer(
  input: string,
): { ok: true; value: number | undefined } | { ok: false } {
  const t = input.trim();
  if (!t) return { ok: true, value: undefined };
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false };
  return { ok: true, value: n };
}

/** Parse a report-format answer. Blank or unrecognized → undefined (keep default). */
export function parseFormatAnswer(input: string): ReportFormat | undefined {
  const t = input.trim().toLowerCase();
  return (VALID_FORMATS as string[]).includes(t) ? (t as ReportFormat) : undefined;
}

/** Split a comma-separated glob list into trimmed, non-empty patterns. */
export function parseGlobList(input: string): string[] {
  return input
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** y/yes (any case) → true; blank → defaultYes; anything else → false. */
export function isAffirmative(input: string, defaultYes: boolean): boolean {
  const t = input.trim().toLowerCase();
  if (!t) return defaultYes;
  return t === "y" || t === "yes";
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((res) => rl.question(question, (answer) => res(answer)));
}

export async function runInit(opts: InitOptions = {}): Promise<void> {
  const rootDir = resolve(opts.rootDir ?? ".");
  const interactive = opts.yes !== true && process.stdin.isTTY === true;

  console.log("");
  console.log(chalk.bold("  VibeDrift setup"));
  console.log(chalk.dim("  Configures .vibedriftignore (paths to skip) and .vibedrift/config.json"));
  console.log(chalk.dim("  (default format, CI score floor). Safe to commit and share."));
  console.log("");

  const detected = await detectExcludeCandidates(rootDir);

  let exclude: string[] = [];
  let failOnScore: number | undefined;
  let format: ReportFormat | undefined;
  let installHook = false;

  if (!interactive) {
    // Non-interactive: `--yes` opts into the detected exclusions; a non-TTY
    // without --yes writes config defaults only and leaves exclusions alone
    // (we never auto-exclude without an explicit opt-in).
    if (opts.yes) {
      exclude = detected.globs;
    } else {
      console.log(
        chalk.dim("  Non-interactive shell: writing config defaults only. Re-run with --yes"),
      );
      console.log(chalk.dim("  to accept detected exclusions, or pass globs to `vibedrift ignore`."));
      console.log("");
    }
  } else {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      // ── Exclusions (detect auto, exclude on confirmation) ──
      if (detected.count > 0) {
        console.log(
          chalk.yellow(`  Found ${detected.count} file(s) that look like fixtures or generated code:`),
        );
        for (const g of detected.globs) console.log(chalk.dim(`      ${g}`));
        const ans = await ask(
          rl,
          chalk.bold("  Exclude these from your Vibe Drift Score? ") + chalk.dim("[Y/n] "),
        );
        if (isAffirmative(ans, true)) exclude.push(...detected.globs);
        console.log("");
      }
      const extra = await ask(
        rl,
        "  Any other paths to exclude? " +
          chalk.dim("(comma-separated globs, blank to skip) "),
      );
      exclude.push(...parseGlobList(extra));

      // ── CI score floor ──
      console.log("");
      const thresholdAns = await ask(
        rl,
        "  Fail CI when the Vibe Drift Score drops below? " +
          chalk.dim("(0-100, blank = none) "),
      );
      const parsed = parseThresholdAnswer(thresholdAns);
      if (!parsed.ok) {
        console.log(chalk.dim("    Not a number 0-100 — leaving CI threshold unset."));
      } else {
        failOnScore = parsed.value;
      }

      // ── Default report format ──
      const formatAns = await ask(
        rl,
        "  Default report format? " + chalk.dim("(html/terminal/json) [html] "),
      );
      format = parseFormatAnswer(formatAns);

      // ── Pre-push hook ──
      // The hook enforces failOnScore if set, else the CLI's built-in default
      // (runHook prints the exact number it installs), so the prompt avoids
      // implying it reuses a threshold the user may have left blank.
      const hookScore = failOnScore !== undefined ? `below ${failOnScore}` : "low-scoring";
      const hookAns = await ask(
        rl,
        `  Install a git pre-push hook to block ${hookScore} pushes? ` +
          chalk.dim("[y/N] "),
      );
      installHook = isAffirmative(hookAns, false);
    } finally {
      rl.close();
    }
  }

  const result = await runInitCore({ rootDir, exclude, failOnScore, format });

  // ── Summary ──
  console.log("");
  console.log(chalk.green("  ✓ VibeDrift configured."));
  console.log(chalk.dim(`      ${projectConfigPath(rootDir)}`));
  if (result.config.format) console.log(chalk.dim(`        default format: ${result.config.format}`));
  if (result.config.failOnScore !== undefined) {
    console.log(chalk.dim(`        CI fails below:  ${result.config.failOnScore}`));
  }
  if (result.excludesAdded.length > 0) {
    console.log(chalk.dim(`      ${IGNORE_FILENAME} (+${result.excludesAdded.length}):`));
    for (const p of result.excludesAdded) console.log(chalk.dim(`        ${p}`));
  }
  console.log("");
  console.log(chalk.dim("  Commit .vibedrift/config.json and .vibedriftignore to share this setup."));
  console.log("");

  // Hook install last: it's Pro-gated and may exit the process with an
  // upgrade prompt, so everything above is already written and shown.
  if (installHook) {
    await runHook("install", { threshold: failOnScore }, rootDir);
  }
}
