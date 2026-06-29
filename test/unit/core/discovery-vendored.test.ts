import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { discoverFiles } from "../../../src/core/discovery.js";

/**
 * Phase 0 precision fix: vendored / minified / generated files (e.g. a
 * checked-in jquery-3.2.1.min.js or the Ace editor bundle ace.js) are not the
 * user's code and produced the bulk of the deep-value eval's false positives
 * (16/19 on the messy repos were inside ace.js / jquery.min.js). They must be
 * excluded from discovery (and thus from every analysis layer).
 */
describe("discovery: vendored / minified file exclusion", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "vd-vendored-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("excludes *.min.js and *.bundle.js by filename, keeps real source", async () => {
    await writeFile(join(dir, "app.ts"), "export const a = 1;\n");
    await writeFile(join(dir, "jquery-3.2.1.min.js"), "var x=1;function f(){return 2;}\n");
    await writeFile(join(dir, "vendor.bundle.js"), "var y=2;\n");
    const { files } = await discoverFiles(dir);
    const names = files.map((f) => f.relativePath);
    expect(names).toContain("app.ts");
    expect(names).not.toContain("jquery-3.2.1.min.js");
    expect(names).not.toContain("vendor.bundle.js");
  });

  it("excludes minified bundles by very long lines regardless of filename (e.g. ace.js)", async () => {
    await writeFile(join(dir, "normal.js"), "function add(a, b) {\n  return a + b;\n}\n");
    // Ace-style single-line bundle (~3600 chars on one line), no `.min` in the name.
    await writeFile(join(dir, "ace.js"), "var ACE=(function(){" + "a=a+1;".repeat(600) + "})();\n");
    const { files } = await discoverFiles(dir);
    const names = files.map((f) => f.relativePath);
    expect(names).toContain("normal.js");
    expect(names).not.toContain("ace.js");
  });
});
