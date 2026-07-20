import { describe, it, expect } from "vitest";
import { generateTeaseMessages, countReimplementationCandidates } from "../../../src/output/tease.js";
import type { ExtractedFunction } from "../../../src/codedna/types.js";
import type { AnalysisContext } from "../../../src/core/types.js";
import type { CodeDnaResult } from "../../../src/codedna/types.js";

function mkFn(p: Partial<ExtractedFunction>): ExtractedFunction {
  return {
    name: "fn",
    file: "/abs/x.ts",
    relativePath: "src/x.ts",
    line: 1,
    language: "typescript",
    params: [],
    paramCount: 0,
    rawBody: "return compute(a, b)",
    declarationCode: "",
    domainCategory: "general",
    bodyTokens: [],
    bodyTokenCount: 20,
    bodyHash: 0,
    ...p,
  };
}

describe("countReimplementationCandidates", () => {
  it("counts a name appearing in 2+ shipped files once", () => {
    expect(countReimplementationCandidates([
      mkFn({ name: "sendMessage", relativePath: "src/a.ts" }),
      mkFn({ name: "sendMessage", relativePath: "src/b.ts" }),
    ])).toBe(1);
  });

  it("does not count a name confined to one file", () => {
    expect(countReimplementationCandidates([
      mkFn({ name: "sendMessage", relativePath: "src/a.ts" }),
      mkFn({ name: "sendMessage", relativePath: "src/a.ts" }),
    ])).toBe(0);
  });

  it("excludes test/example paths (non-shipped)", () => {
    expect(countReimplementationCandidates([
      mkFn({ name: "sendMessage", relativePath: "test/a.test.ts" }),
      mkFn({ name: "sendMessage", relativePath: "src/b.ts" }),
    ])).toBe(0); // only one shipped occurrence remains
  });

  it("excludes generic names, short names, and trivial bodies", () => {
    expect(countReimplementationCandidates([
      mkFn({ name: "handle", relativePath: "src/a.ts" }),
      mkFn({ name: "handle", relativePath: "src/b.ts" }),
      mkFn({ name: "go", relativePath: "src/c.ts" }),
      mkFn({ name: "go", relativePath: "src/d.ts" }),
      mkFn({ name: "tinyHelper", relativePath: "src/e.ts", bodyTokenCount: 3 }),
      mkFn({ name: "tinyHelper", relativePath: "src/f.ts", bodyTokenCount: 3 }),
    ])).toBe(0);
  });

  it("counts multiple distinct reimplemented names", () => {
    expect(countReimplementationCandidates([
      mkFn({ name: "sendMessage", relativePath: "src/a.ts" }),
      mkFn({ name: "sendMessage", relativePath: "src/b.ts" }),
      mkFn({ name: "formatDate", relativePath: "src/a.ts" }),
      mkFn({ name: "formatDate", relativePath: "src/c.ts" }),
    ])).toBe(2);
  });
});

describe("generateTeaseMessages — auth-aware sign-in nudge (#64 item 1)", () => {
  const SIGN_IN_ASK = "Sign in with `vibedrift login`";
  const SIGNED_IN_LINE = "Your first deep scan each month is free";

  // Minimal context; the generic-name signal (below) is what makes the tease
  // fire, so ctx.files only matters for the fallback path we don't exercise.
  const ctx = { files: [] } as unknown as AnalysisContext;
  // A generic-named function with a non-trivial body → Signal 2 fires, so the
  // tease produces messages and therefore appends a closing line.
  const dna = {
    functions: [{ name: "handle", relativePath: "src/a.ts", line: 5, bodyTokenCount: 25 }],
  } as unknown as CodeDnaResult;

  it("signed-in: closing line never asks the user to sign in", () => {
    const msgs = generateTeaseMessages(ctx, [], false, dna, true);
    expect(msgs.length).toBeGreaterThan(0);
    expect(msgs.join("\n")).not.toContain(SIGN_IN_ASK);
    expect(msgs.some((m) => m.includes(SIGNED_IN_LINE))).toBe(true);
  });

  it("signed-out: keeps the existing sign-in copy unchanged", () => {
    const msgs = generateTeaseMessages(ctx, [], false, dna, false);
    expect(msgs.some((m) => m.includes(SIGN_IN_ASK))).toBe(true);
    expect(msgs.join("\n")).not.toContain(SIGNED_IN_LINE);
  });

  it("defaults to the signed-out copy when isSignedIn is omitted", () => {
    const msgs = generateTeaseMessages(ctx, [], false, dna);
    expect(msgs.some((m) => m.includes(SIGN_IN_ASK))).toBe(true);
  });

  it("emits no tease (and so no nudge) on a deep scan", () => {
    expect(generateTeaseMessages(ctx, [], true, dna, false)).toEqual([]);
  });
});
