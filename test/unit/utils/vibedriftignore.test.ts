import { describe, it, expect } from "vitest";
import { mergeIgnorePatterns } from "../../../src/utils/vibedriftignore.js";

describe("mergeIgnorePatterns", () => {
  it("seeds a header and the patterns for a new file", () => {
    const r = mergeIgnorePatterns(null, ["**/fixtures/**", "**/*.generated.*"]);
    expect(r.content).toContain("# VibeDrift scan exclusions");
    expect(r.content).toContain("**/fixtures/**");
    expect(r.content).toContain("**/*.generated.*");
    expect(r.added).toEqual(["**/fixtures/**", "**/*.generated.*"]);
    expect(r.skipped).toEqual([]);
  });

  it("appends only new patterns and reports duplicates as skipped", () => {
    const existing = "# my excludes\n**/fixtures/**\n";
    const r = mergeIgnorePatterns(existing, ["**/fixtures/**", "dist/**"]);
    expect(r.added).toEqual(["dist/**"]);
    expect(r.skipped).toEqual(["**/fixtures/**"]);
    expect(r.content).toBe("# my excludes\n**/fixtures/**\ndist/**\n");
  });

  it("preserves comments and existing content; does not re-add the header", () => {
    const existing = "# keep me\nsrc/legacy/**\n";
    const r = mergeIgnorePatterns(existing, ["build/**"]);
    expect(r.content.startsWith("# keep me\n")).toBe(true);
    expect(r.content).not.toContain("VibeDrift scan exclusions");
  });

  it("trims and de-duplicates input patterns", () => {
    const r = mergeIgnorePatterns(null, ["  a/** ", "a/**", "", "b/**"]);
    expect(r.added).toEqual(["a/**", "b/**"]);
  });

  it("handles an existing file with no trailing newline", () => {
    const r = mergeIgnorePatterns("a/**", ["b/**"]);
    expect(r.content).toBe("a/**\nb/**\n");
  });
});
