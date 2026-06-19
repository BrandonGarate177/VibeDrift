import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildCandidatePayloads, MAX_CANDIDATES } from "../../../src/mcp/candidate-feeder.js";
import type { MlFunctionPayload } from "../../../src/ml-client/types.js";

function query(file: string, id: string): MlFunctionPayload {
  return {
    id,
    name: id.split("::").pop() ?? "q",
    file,
    body: "function x(){ return 1; }",
    line_start: 0,
    line_end: 0,
    language: "typescript",
  };
}

describe("buildCandidatePayloads", () => {
  let repo: string;
  beforeAll(() => {
    repo = mkdtempSync(join(tmpdir(), "vd-cand-"));
    writeFileSync(
      join(repo, "a.ts"),
      "export async function getUserById(repo, id){ const u = await repo.users.findById(id); if(!u) throw new NotFound(); return u; }\n",
    );
    writeFileSync(
      join(repo, "b.ts"),
      "export function addNumbers(a, b){ const total = a + b; return total; }\n",
    );
  });
  afterAll(() => rmSync(repo, { recursive: true, force: true }));

  it("returns the query first, then the repo's other functions as candidates", async () => {
    const q = query("query", "query::newFn");
    const out = await buildCandidatePayloads(repo, q);
    expect(out[0]).toBe(q);
    expect(out.length).toBeGreaterThan(1);
    expect(out.length).toBeLessThanOrEqual(MAX_CANDIDATES + 1);
    expect(out.slice(1).some((c) => c.name === "getUserById")).toBe(true);
  });

  it("drops candidates that share the query's file (no self-match when editing a file)", async () => {
    const q = query("a.ts", "a.ts::getUserById");
    const out = await buildCandidatePayloads(repo, q);
    expect(out[0]).toBe(q);
    expect(out.slice(1).every((c) => c.file !== "a.ts")).toBe(true);
  });

  it("degrades to query-only when the repo can't be read", async () => {
    const q = query("query", "query::x");
    const out = await buildCandidatePayloads(join(tmpdir(), "vd-does-not-exist-zzz-9182"), q);
    expect(out).toEqual([q]);
  });
});
