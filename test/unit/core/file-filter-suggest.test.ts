import { describe, it, expect } from "vitest";
import { suggestExclusions } from "../../../src/core/file-filter.js";

describe("suggestExclusions", () => {
  it("flags fixture and generated paths, not real source or tests", () => {
    const paths = [
      "src/index.ts",
      "src/api/users.ts",
      "test/users.test.ts", // a real test — must NOT be flagged
      "eval/discrimination/fixtures/messy/auth.ts",
      "test/fixtures/sample.ts",
      "src/db/schema.generated.ts",
      "app/__mocks__/fs.ts",
    ];
    const s = suggestExclusions(paths);
    expect(s.count).toBe(4); // 2 fixtures + 1 generated + 1 mock
    expect(s.globs).toContain("**/fixtures/**");
    expect(s.globs).toContain("**/__mocks__/**");
    expect(s.globs).toContain("**/*.generated.*");
  });

  it("returns count 0 and no globs for a clean source tree", () => {
    const s = suggestExclusions(["src/a.ts", "src/b.ts", "lib/c.ts"]);
    expect(s.count).toBe(0);
    expect(s.globs).toEqual([]);
  });

  it("does not flag a real test suite", () => {
    const s = suggestExclusions(["test/a.test.ts", "tests/b.spec.ts", "src/a.test.ts"]);
    expect(s.count).toBe(0);
  });

  it("returns sorted, de-duplicated globs", () => {
    const s = suggestExclusions([
      "a/fixtures/x.ts",
      "b/fixtures/y.ts",
      "c/snapshots/z.ts",
    ]);
    expect(s.globs).toEqual(["**/fixtures/**", "**/snapshots/**"]);
  });
});
