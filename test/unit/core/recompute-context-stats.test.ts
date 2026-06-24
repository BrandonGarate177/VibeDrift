import { describe, it, expect } from "vitest";
import { recomputeContextStats } from "../../../src/core/discovery.js";
import type { AnalysisContext, SourceFile } from "../../../src/core/types.js";

function mkFile(relativePath: string, language: SourceFile["language"], lineCount: number): SourceFile {
  return { path: "/repo/" + relativePath, relativePath, language, content: "", lineCount };
}

function mkCtx(files: SourceFile[]): AnalysisContext {
  return {
    rootDir: "/repo",
    files,
    packageJson: null,
    goMod: null,
    cargoToml: null,
    requirementsTxt: null,
    envExample: null,
    totalLines: files.reduce((s, f) => s + f.lineCount, 0),
    languageBreakdown: new Map(),
    dominantLanguage: null,
  };
}

describe("recomputeContextStats", () => {
  it("refreshes totalLines, languageBreakdown and dominantLanguage after filtering", () => {
    const ctx = mkCtx([
      mkFile("a.ts", "typescript", 100),
      mkFile("b.ts", "typescript", 100),
      mkFile("c.py", "python", 500),
    ]);
    recomputeContextStats(ctx);
    // Python has the most lines initially.
    expect(ctx.totalLines).toBe(700);
    expect(ctx.dominantLanguage).toBe("python");

    // Drop the python file (e.g. --exclude "**/*.py"): stats must follow.
    ctx.files = ctx.files.filter((f) => f.language === "typescript");
    recomputeContextStats(ctx);
    expect(ctx.totalLines).toBe(200);
    expect(ctx.dominantLanguage).toBe("typescript");
    expect(ctx.languageBreakdown.get("typescript")).toEqual({ files: 2, lines: 200 });
    expect(ctx.languageBreakdown.has("python")).toBe(false);
  });
});
