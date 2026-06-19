import type { MlFunctionPayload } from "./types.js";

const DEFAULT_API_URL = "https://vibedrift-api.fly.dev";
const TIMEOUT_MS = 90_000; // cold starts + model load
// Stay under the server's per-request cap (96) and the 200KB body limit.
const EMBED_CHUNK = 48;

export interface EmbeddingItem {
  id: string;
  vector: number[];
}

interface EmbedResponse {
  model: string;
  dim: number;
  embeddings: EmbeddingItem[];
}

/**
 * Fetch embedding vectors for a batch of functions from POST /v1/embed.
 *
 * Chunks client-side to respect the server's per-request cap. Returns the
 * concatenated vectors. Throws on a non-2xx so callers can degrade (the index
 * builder and the in-loop deep path both treat a throw as "no vectors" and fall
 * back). The server computes embeddings transiently and stores nothing.
 */
export async function embedFunctions(
  functions: MlFunctionPayload[],
  token: string,
  apiUrl?: string,
  source: "cli" | "mcp" = "cli",
): Promise<EmbeddingItem[]> {
  const url = `${apiUrl ?? DEFAULT_API_URL}/v1/embed`;
  const out: EmbeddingItem[] = [];

  for (let i = 0; i < functions.length; i += EMBED_CHUNK) {
    const chunk = functions.slice(i, i + EMBED_CHUNK);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          functions: chunk.map((f) => ({ id: f.id, body: f.body, language: f.language })),
          source,
        }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const t = await resp.text().catch(() => "");
        throw new Error(`Embed API error ${resp.status}: ${t.slice(0, 200)}`);
      }
      const data = (await resp.json()) as EmbedResponse;
      out.push(...(data.embeddings ?? []));
    } finally {
      clearTimeout(timeout);
    }
  }

  return out;
}
