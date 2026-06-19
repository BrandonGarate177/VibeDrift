import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { embedFunctions } from "../../../src/ml-client/embed-client.js";
import type { MlFunctionPayload } from "../../../src/ml-client/types.js";

function fn(i: number): MlFunctionPayload {
  return { id: `f${i}.ts::fn${i}`, name: `fn${i}`, file: `f${i}.ts`, body: `function fn${i}(){}`, line_start: 0, line_end: 0, language: "typescript" };
}

function okResponse(ids: string[]) {
  return {
    ok: true,
    json: async () => ({ model: "m", dim: 3, embeddings: ids.map((id) => ({ id, vector: [1, 2, 3] })) }),
  };
}

describe("embedFunctions", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllGlobals());

  it("chunks at 48 functions/request and concatenates the vectors", async () => {
    const calls: any[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: any) => {
      const sent = JSON.parse(init.body).functions.map((f: any) => f.id);
      calls.push(sent);
      return okResponse(sent) as any;
    }));
    const out = await embedFunctions(Array.from({ length: 100 }, (_, i) => fn(i)), "tok");
    // 100 -> chunks of 48,48,4 = 3 requests
    expect(calls).toHaveLength(3);
    expect(calls[0]).toHaveLength(48);
    expect(calls[2]).toHaveLength(4);
    expect(out).toHaveLength(100);
  });

  it("sends a Bearer token and only id/body/language per function", async () => {
    let init: any;
    vi.stubGlobal("fetch", vi.fn(async (_url: string, i: any) => { init = i; return okResponse([fn(0).id]) as any; }));
    await embedFunctions([fn(0)], "secret-token");
    expect(init.headers.Authorization).toBe("Bearer secret-token");
    const sentFn = JSON.parse(init.body).functions[0];
    expect(Object.keys(sentFn).sort()).toEqual(["body", "id", "language"]);
    expect(JSON.parse(init.body).source).toBe("cli");
  });

  it("throws on a non-2xx so callers can degrade", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 402, text: async () => "quota" }) as any));
    await expect(embedFunctions([fn(0)], "tok")).rejects.toThrow(/Embed API error 402/);
  });

  it("returns [] for no functions without calling the network", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const out = await embedFunctions([], "tok");
    expect(out).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
});
