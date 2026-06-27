import { describe, it, expect } from "vitest";
import { mkdtemp, readFile as rf, writeFile as wf } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import {
  MANAGED_BLOCK_START,
  MANAGED_BLOCK_END,
  upsertManagedBlock,
  injectContext,
} from "../../../src/output/inject-context.js";

describe("upsertManagedBlock", () => {
  it("appends a fenced managed block when none exists", () => {
    const out = upsertManagedBlock("# My Rules\n", "hello patterns");
    expect(out).toContain("# My Rules");
    expect(out).toContain(MANAGED_BLOCK_START);
    expect(out).toContain("hello patterns");
    expect(out).toContain(MANAGED_BLOCK_END);
  });

  it("replaces the block body on re-run instead of duplicating it", () => {
    const once = upsertManagedBlock("# Rules\n", "v1 body");
    const twice = upsertManagedBlock(once, "v2 body");
    expect(twice.split(MANAGED_BLOCK_START).length - 1).toBe(1); // exactly one block
    expect(twice).toContain("v2 body");
    expect(twice).not.toContain("v1 body");
  });

  it("is idempotent for identical input", () => {
    const a = upsertManagedBlock("# Rules\n", "same");
    const b = upsertManagedBlock(a, "same");
    expect(b).toBe(a);
  });

  it("preserves text outside the markers untouched", () => {
    const base = "# Top\n\nkeep me\n";
    const out = upsertManagedBlock(base, "block");
    expect(out.startsWith("# Top\n\nkeep me")).toBe(true);
  });

  it("produces a clean single block from an empty string with no leading blank line", () => {
    const out = upsertManagedBlock("", "body");
    expect(out.startsWith(MANAGED_BLOCK_START)).toBe(true);
    expect(out.split(MANAGED_BLOCK_START).length - 1).toBe(1);
    expect(out).toContain("body");
  });
});

describe("injectContext", () => {
  it("creates CLAUDE.md with the block when the file is absent", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vd-inject-"));
    const written = await injectContext(dir, "# VibeDrift Context\nbody");
    expect(written).toEqual(["CLAUDE.md"]);
    const content = await rf(join(dir, "CLAUDE.md"), "utf8");
    expect(content).toContain("# VibeDrift Context");
    expect(content).toContain("vibedrift:context:start");
  });

  it("updates an existing CLAUDE.md without losing prior content", async () => {
    const dir = await mkdtemp(join(tmpdir(), "vd-inject-"));
    await wf(join(dir, "CLAUDE.md"), "# House rules\nkeep me\n");
    await injectContext(dir, "patterns v1");
    await injectContext(dir, "patterns v2");
    const content = await rf(join(dir, "CLAUDE.md"), "utf8");
    expect(content).toContain("keep me");
    expect(content).toContain("patterns v2");
    expect(content).not.toContain("patterns v1");
    expect(content.split("vibedrift:context:start").length - 1).toBe(1);
  });
});
