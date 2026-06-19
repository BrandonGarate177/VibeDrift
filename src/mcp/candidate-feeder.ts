/**
 * Candidate feeding for in-loop deep checks.
 *
 * The /v1/analyze duplicate detector is PAIRWISE: it only flags a clone when the
 * query function is sent alongside the functions it might duplicate. Sending the
 * single query function (what the tools did) left the deep path repo-blind — the
 * server had nothing to compare against and always returned `duplicates: []`.
 *
 * This re-extracts the repo's functions from disk, samples them with the same
 * caps the batch `--deep` path uses, drops the query's own file/id, caps the list
 * to fit the server's 30-function limit, and returns `[query, ...candidates]` so
 * the existing pairwise detector can surface query-vs-candidate clones.
 *
 * Stateless by design: no server persistence, the cost is one repo walk per deep
 * call (deep is opt-in and already a network round-trip). Fails soft to `[query]`
 * so the deep path still runs — yielding no duplicates, exactly as before — if
 * extraction throws or the repo is empty.
 *
 * Follow-up (the data-moat play): a persisted per-repo embedding index would
 * remove both the per-call repo walk and the 29-candidate recall ceiling.
 */
import { buildAnalysisContext } from "../core/discovery.js";
import { extractAllFunctions } from "../codedna/function-extractor.js";
import { sampleFunctionsForMl } from "../ml-client/sampler.js";
import type { MlFunctionPayload } from "../ml-client/types.js";

// /v1/analyze rejects > 30 functions per request (HTTP 400). The query takes one
// slot, so candidates are capped at 29.
export const MAX_CANDIDATES = 29;

/**
 * Build the function list to send for an in-loop deep check: the query function
 * first, then a capped sample of the repo's OTHER functions to compare it against.
 * Same-file candidates are dropped (the server skips same-file pairs anyway, and a
 * function being edited must not match itself).
 */
export async function buildCandidatePayloads(
  rootDir: string,
  queryPayload: MlFunctionPayload,
): Promise<MlFunctionPayload[]> {
  try {
    const { ctx } = await buildAnalysisContext(rootDir);
    const fns = extractAllFunctions(ctx.files);
    const candidates = sampleFunctionsForMl(fns, [])
      .filter((c) => c.file !== queryPayload.file && c.id !== queryPayload.id)
      .slice(0, MAX_CANDIDATES);
    return [queryPayload, ...candidates];
  } catch {
    // Degrade to query-only: the deep call still runs and simply finds no
    // cross-repo clone (the prior behavior), rather than erroring the agent.
    return [queryPayload];
  }
}
