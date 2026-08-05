/**
 * Regression tests for issue #81 — validate_change/find_similar_function
 * scoring exact-logic duplicates as unrelated when the query includes the
 * function's signature, because the baseline index is body-only
 * (`extractAllFunctions(...).rawBody`) but nothing stripped the signature
 * back off the query side.
 *
 * Population measurement (scratch script, not committed — see the
 * contributor guide on bar-4 measurement): across every function in this
 * repo's own src/ (1024 functions), scoring a verbatim self-clone WITH its
 * signature against the body-only index:
 *   before: median 0.752, 74.8% scored under validate_change's 0.8
 *     threshold, 4.5% scored an exact hard 0 (lcsSimilarity's length-ratio
 *     gate firing before any LCS ran, for short functions where the
 *     signature alone more than doubled the token count).
 *   after:  median 1.000, 0.1% under 0.8 (one pathological case: a
 *     multi-line JSDoc comment embedded inside an inline return-type
 *     literal), 0% under find_similar_function's 0.6 threshold, 0% hard zero.
 */
import { describe, it, expect } from "vitest";
import { stripLeadingSignature, findSimilarToBody, type SimIndexEntry } from "@/codedna/find-similar-to-body";
import { buildSignature } from "@/codedna/minhash";

describe("stripLeadingSignature", () => {
  it("strips a plain function declaration", () => {
    const text = `function add(a, b) {\n  return a + b;\n}`;
    expect(stripLeadingSignature(text)).toBe(`\n  return a + b;\n}`);
  });

  it("strips a signature with a generic type parameter between the name and the params", () => {
    // `<T>` sits between the identifier and `(`, defeating a naive
    // "identifier immediately followed by (" check.
    const text = `export function first<T>(items: T[]): T | undefined {\n  return items[0];\n}`;
    expect(stripLeadingSignature(text)).toBe(`\n  return items[0];\n}`);
  });

  it("finds the REAL body brace when the return type itself contains a brace", () => {
    // The first `{` in the text is the return type's object literal, not the
    // body. Picking it would produce a garbage "body" that's actually the
    // return type plus the real body glued together.
    const text = `function pair(a: number, b: number): { sum: number } {\n  return { sum: a + b };\n}`;
    expect(stripLeadingSignature(text)).toBe(`\n  return { sum: a + b };\n}`);
  });

  it("strips an arrow function", () => {
    const text = `const add = (a: number, b: number) => {\n  return a + b;\n};`;
    // The balanced-brace match stops at the closing `}`; the arrow function's
    // own trailing `;` is leftover text, not part of the match. Still a
    // valid candidate: the 1-char gap is within the tolerance for trailing
    // punctuation the "closest to the end" check allows.
    expect(stripLeadingSignature(text)).toBe(`\n  return a + b;\n}`);
  });

  it("strips a Python def", () => {
    const text = `def add(a, b):\n    return a + b`;
    expect(stripLeadingSignature(text)).toBe(`    return a + b`);
  });

  it("strips a Go func", () => {
    const text = `func add(a int, b int) int {\n\treturn a + b\n}`;
    expect(stripLeadingSignature(text)).toBe(`\n\treturn a + b\n}`);
  });

  it("returns null for a body-only paste (nothing to strip)", () => {
    const text = `\n  return a + b;\n}`;
    expect(stripLeadingSignature(text)).toBeNull();
  });

  it("returns null when an early brace's match doesn't reach the end (body-only paste with an early nested block)", () => {
    // A body-only paste that happens to open with an `if` block. The first
    // `{` here is real code, but its match ends well before the text does,
    // so it must NOT be mistaken for a signature boundary.
    const text = `if (x) {\n  doThing();\n}\nreturn compute(x);`;
    expect(stripLeadingSignature(text)).toBeNull();
  });

  it("returns null for an empty body", () => {
    expect(stripLeadingSignature(`function noop() {}`)).toBeNull();
  });
});

describe("findSimilarToBody — signature-inclusive query (issue #81)", () => {
  function indexFor(body: string, name = "target", relativePath = "src/target.ts"): SimIndexEntry[] {
    const sig = buildSignature(body); // index side: body-only, matches core/baseline.ts's convention
    return [{ relativePath, name, line: 1, tokens: sig.tokens }];
  }

  it("catches a short function's self-clone even with the signature included (was a hard 0 before the fix)", () => {
    // Real shape from this repo: src/auth/plan.ts's isPaidPlan. Short enough
    // that lcsSimilarity's length-ratio gate returned an outright 0 before
    // this fix, not just a deflated score.
    const body = `\n  return plan === "pro" || plan === "enterprise";\n}`;
    const index = indexFor(body);
    const query = `export function isPaidPlan(plan?: Plan | null): boolean {${body}`;
    const matches = findSimilarToBody(query, index, { threshold: 0.8, cap: 20 });
    expect(matches).toHaveLength(1);
    expect(matches[0].similarity).toBeGreaterThanOrEqual(0.99);
  });

  it("catches a longer function's self-clone with the signature included, at validate_change's 0.8 threshold", () => {
    const body = `\n  const parsed = productSchema.safeParse(input);\n  if (!parsed.success) return { ok: false, error: parsed.error };\n  return { ok: true, value: parsed.data };\n}`;
    const index = indexFor(body);
    const query = `export function validateProduct(input: unknown): Result<Product> {${body}`;
    const matches = findSimilarToBody(query, index, { threshold: 0.8, cap: 20 });
    expect(matches).toHaveLength(1);
  });

  it("still rejects a genuinely different function (the fix must not manufacture false positives)", () => {
    // Structurally different control flow, not just different names/literals
    // -- a same-shape short predicate pair would collide under
    // normalizeTokens regardless of this fix (that's issue #82, a separate,
    // already-filed bug in the token-normalization step itself).
    const index = indexFor(`\n  const rows = await db.users.findMany({ where: { active: true } });\n  return rows.map((r) => r.id);\n}`);
    const unrelated = `export async function computeTotal(items: Item[]): Promise<number> {\n  let total = 0;\n  for (const item of items) {\n    total += item.price * item.quantity;\n  }\n  return total;\n}`;
    const matches = findSimilarToBody(unrelated, index, { threshold: 0.8, cap: 20 });
    expect(matches).toEqual([]);
  });

  it("body-only queries (the pre-fix working case) are unaffected", () => {
    const body = `\n  return plan === "pro" || plan === "enterprise";\n}`;
    const index = indexFor(body);
    const matches = findSimilarToBody(body, index, { threshold: 0.8, cap: 20 });
    expect(matches).toHaveLength(1);
    expect(matches[0].similarity).toBe(1);
  });
});
