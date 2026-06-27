import { describe, it, expect } from "vitest";
import { mkdtemp, readFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

// writeContextIfRequested is module-private; export it for testing via a thin re-export.
import { __test_writeContextIfRequested as writeContextIfRequested } from "../../../src/cli/commands/scan.js";

function fakeResult() {
  return {
    compositeScore: 80,
    maxCompositeScore: 100,
    context: { dominantLanguage: "typescript", files: [{}, {}], totalLines: 1000 },
    driftFindings: [],
    findings: [],
  } as any;
}

describe("--inject-context wiring", () => {
  it("writes a managed block into CLAUDE.md when injectContext is set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vd-wire-"));
    await writeContextIfRequested(fakeResult(), { injectContext: true } as any, dir);
    const claude = await readFile(join(dir, "CLAUDE.md"), "utf8");
    expect(claude).toContain("vibedrift:context:start");
    expect(claude).toContain("Vibe Drift Score");
  });

  it("does nothing when neither writeContext nor injectContext is set", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vd-wire-"));
    await writeContextIfRequested(fakeResult(), {} as any, dir);
    await expect(readFile(join(dir, "CLAUDE.md"), "utf8")).rejects.toBeTruthy();
  });
});
