/**
 * Append-only JSONL session ledger.
 *
 * Writes are one line per event via a single appendFile call; readers tolerate
 * corrupt lines (an interrupted write must never take the tape down with it).
 */

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { maskSecrets } from "./mask.js";
import type { SessionEvent, SessionEventDetail } from "./types.js";

/** Hard cap per line so a pathological prompt cannot bloat the ledger. */
const MAX_LINE_BYTES = 32 * 1024;

export function newActivityId(): string {
  return `evt-${Date.now().toString(36)}-${randomBytes(3).toString("hex")}`;
}

/** Confine an untrusted id (session id comes from the hook payload) to a single
 *  safe path segment: no separators, no `..`, so it can never escape the
 *  per-project sessions dir or target a directory that was never created. */
export function safeSegment(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9._-]/g, "_").replace(/^\.+/, "_");
  return cleaned.length > 0 ? cleaned.slice(0, 128) : "unknown";
}

export function sessionFilePath(baseDir: string, projectHash: string, sessionId: string): string {
  return join(baseDir, safeSegment(projectHash), `${safeSegment(sessionId)}.jsonl`);
}

function byteLen(s: string): number {
  return Buffer.byteLength(s, "utf8");
}

/** Writer-side defense in depth: the transient edit body is stripped by the
 *  hook before append (a single destructure in hook-entry.ts), but the writer
 *  refuses to persist a `body` key regardless — at the top level and inside
 *  detail — so a future producer bug can never land file contents on disk.
 *  Events without the key pass through byte-identical. */
function stripBody(ev: SessionEvent): SessionEvent {
  let out = ev;
  if ("body" in (out as unknown as Record<string, unknown>)) {
    const { body: _top, ...rest } = out as SessionEvent & { body?: unknown };
    out = rest as SessionEvent;
  }
  if (out.detail && typeof out.detail === "object" && "body" in (out.detail as Record<string, unknown>)) {
    const { body: _nested, ...detail } = out.detail as SessionEventDetail & { body?: unknown };
    out = { ...out, detail: detail as SessionEventDetail };
  }
  return out;
}

export async function appendEvent(
  baseDir: string,
  projectHash: string,
  sessionId: string,
  ev: SessionEvent,
): Promise<void> {
  const dir = join(baseDir, safeSegment(projectHash));
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const clean = stripBody(ev);
  let line = JSON.stringify(clean);
  // Cap by UTF-8 BYTES, not code units: a CJK/emoji prompt is 1 code unit but
  // 3-4 bytes each, so a length check would pass lines ~3x over the cap.
  //
  // Oversize handling covers EVERY string field in detail plus msgToAgent, not
  // just promptText: an oversized decision reason or advisory must not blow
  // past the cap either. Order is mask-then-truncate — truncating first could
  // bisect a secret so the masking regex no longer sees its shape and a
  // fragment leaks. maskSecrets is idempotent, so re-masking text the producer
  // already masked is a no-op; well-formed small events skip this path
  // entirely and persist byte-identical.
  if (byteLen(line) > MAX_LINE_BYTES) {
    const detail: Record<string, unknown> = { ...(clean.detail as unknown as Record<string, unknown>) };
    for (const [k, v] of Object.entries(detail)) {
      if (typeof v === "string") detail[k] = maskSecrets(v);
    }
    let msgToAgent = typeof clean.msgToAgent === "string" ? maskSecrets(clean.msgToAgent) : undefined;
    const rebuild = (): string =>
      JSON.stringify({
        ...clean,
        ...(msgToAgent !== undefined ? { msgToAgent } : {}),
        detail: { ...detail, truncated: true },
      });
    line = rebuild();
    // Shrink the longest text field each pass until the whole serialized line
    // fits; cheap and convergent for any multibyte content (each pass cuts
    // that field by at least a quarter, bottoming out at the empty string).
    while (byteLen(line) > MAX_LINE_BYTES) {
      let key: string | null = null;
      let len = 0;
      for (const [k, v] of Object.entries(detail)) {
        if (typeof v === "string" && v.length > len) {
          key = k;
          len = v.length;
        }
      }
      let isMsg = false;
      if (msgToAgent !== undefined && msgToAgent.length > len) {
        key = "msgToAgent";
        len = msgToAgent.length;
        isMsg = true;
      }
      if (key === null || len === 0) break;
      const target = Math.max(0, Math.floor(len * 0.75) - 16);
      if (isMsg) msgToAgent = (msgToAgent as string).slice(0, target);
      else detail[key] = (detail[key] as string).slice(0, target);
      line = rebuild();
    }
  }
  await appendFile(sessionFilePath(baseDir, projectHash, sessionId), `${line}\n`, { mode: 0o600 });
}

/** Parse a chunk of newline-delimited JSON events, skipping any corrupt line
 *  (an interrupted write must never take the reader down). Shared by the
 *  whole-file reader and the live follower. */
export function parseJsonlLines(chunk: string): SessionEvent[] {
  const out: SessionEvent[] = [];
  for (const line of chunk.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as SessionEvent);
    } catch {
      // corrupt line: skip it, never throw
    }
  }
  return out;
}

export async function readSessionEvents(filePath: string): Promise<SessionEvent[]> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    return [];
  }
  return parseJsonlLines(raw);
}
