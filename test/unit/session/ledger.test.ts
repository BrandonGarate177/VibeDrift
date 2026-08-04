import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, appendFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { appendEvent, readSessionEvents, sessionFilePath, newActivityId } from "@/session/ledger";
import type { SessionEvent } from "@/session/types";

const HASH = "abcd1234abcd1234";

const ev = (over: Partial<SessionEvent> = {}): SessionEvent => ({
  v: 1,
  sid: "s1",
  aid: newActivityId(),
  ts: new Date().toISOString(),
  agent: "claude-code",
  projectHash: HASH,
  channel: "hook",
  type: "user_prompt",
  mode: "passive",
  detail: { promptText: "add stripe webhook" },
  ...over,
});

describe("session ledger", () => {
  it("appends one JSON line per event and reads them back in order", async () => {
    const base = mkdtempSync(join(tmpdir(), "vd-ledger-"));
    await appendEvent(base, HASH, "s1", ev());
    await appendEvent(base, HASH, "s1", ev({ type: "edit" }));
    const file = sessionFilePath(base, HASH, "s1");
    const lines = readFileSync(file, "utf8").trim().split("\n");
    expect(lines).toHaveLength(2);
    const events = await readSessionEvents(file);
    expect(events.map((e) => e.type)).toEqual(["user_prompt", "edit"]);
  });

  it("skips corrupt lines on read instead of throwing", async () => {
    const base = mkdtempSync(join(tmpdir(), "vd-ledger-"));
    await appendEvent(base, HASH, "s1", ev());
    const file = sessionFilePath(base, HASH, "s1");
    appendFileSync(file, "{not json\n");
    await appendEvent(base, HASH, "s1", ev({ type: "session_end" }));
    const events = await readSessionEvents(file);
    expect(events.map((e) => e.type)).toEqual(["user_prompt", "session_end"]);
  });

  it("returns [] for a missing file", async () => {
    const base = mkdtempSync(join(tmpdir(), "vd-ledger-"));
    const events = await readSessionEvents(sessionFilePath(base, HASH, "nope"));
    expect(events).toEqual([]);
  });

  it("caps a single line at 32KB by BYTES for ASCII prompts", async () => {
    const base = mkdtempSync(join(tmpdir(), "vd-ledger-"));
    // space-broken ASCII: same byte-cap behavior, avoids the masker's slow
    // path on giant unbroken alphanumeric runs (a regex worst case, not the
    // behavior under test)
    await appendEvent(base, HASH, "s1", ev({ detail: { promptText: "xy z ".repeat(12_800) } }));
    const file = sessionFilePath(base, HASH, "s1");
    const line = readFileSync(file, "utf8").trim();
    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(32 * 1024);
    const parsed = JSON.parse(line) as SessionEvent;
    expect(parsed.detail.truncated).toBe(true);
  });

  it("caps by BYTES for multibyte prompts (CJK is 3 bytes/char)", async () => {
    const base = mkdtempSync(join(tmpdir(), "vd-ledger-"));
    await appendEvent(base, HASH, "s2", ev({ sid: "s2", detail: { promptText: "文".repeat(40_000) } }));
    const file = sessionFilePath(base, HASH, "s2");
    const line = readFileSync(file, "utf8").trim();
    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(32 * 1024);
    expect((JSON.parse(line) as SessionEvent).detail.truncated).toBe(true);
  });

  it("sanitizes path-unsafe session ids so they cannot escape the sessions dir", async () => {
    const base = mkdtempSync(join(tmpdir(), "vd-ledger-"));
    await appendEvent(base, HASH, "../../evil", ev({ sid: "../../evil" }));
    // nothing written outside base
    const escaped = join(base, "..", "..", "evil.jsonl");
    expect(existsSync(escaped)).toBe(false);
    // the sanitized file lives under base/<hash>/
    const events = await readSessionEvents(sessionFilePath(base, HASH, "../../evil"));
    expect(events).toHaveLength(1);
  });

  it("still records when the session id contains a slash", async () => {
    const base = mkdtempSync(join(tmpdir(), "vd-ledger-"));
    await appendEvent(base, HASH, "a/b", ev({ sid: "a/b" }));
    const events = await readSessionEvents(sessionFilePath(base, HASH, "a/b"));
    expect(events).toHaveLength(1);
  });

  it("generates unique activity ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newActivityId()));
    expect(ids.size).toBe(200);
  });
});

describe("session ledger — writer tightenings", () => {
  it("caps an oversized detail.reason (not just promptText)", async () => {
    const base = mkdtempSync(join(tmpdir(), "vd-ledger-"));
    await appendEvent(
      base,
      HASH,
      "s1",
      ev({ type: "decision", detail: { decision: "decline", reason: "too long a reason ".repeat(3_600) } }),
    );
    const line = readFileSync(sessionFilePath(base, HASH, "s1"), "utf8").trim();
    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(32 * 1024);
    const parsed = JSON.parse(line) as SessionEvent;
    expect(parsed.detail.truncated).toBe(true);
    expect(parsed.detail.decision).toBe("decline");
  });

  it("caps an oversized msgToAgent", async () => {
    const base = mkdtempSync(join(tmpdir(), "vd-ledger-"));
    await appendEvent(
      base,
      HASH,
      "s1",
      ev({ type: "flag", msgToAgent: "drift note ".repeat(6_000), detail: { category: "async_pattern" } }),
    );
    const line = readFileSync(sessionFilePath(base, HASH, "s1"), "utf8").trim();
    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(32 * 1024);
    const parsed = JSON.parse(line) as SessionEvent;
    expect(parsed.detail.truncated).toBe(true);
    expect(parsed.detail.category).toBe("async_pattern");
  });

  it("masks BEFORE truncating: a secret straddling the cut never leaks a fragment", async () => {
    const base = mkdtempSync(join(tmpdir(), "vd-ledger-"));
    // A provider-key-shaped secret placed exactly across the first truncation
    // cut (floor(len * 0.75) - 16). A truncate-then-mask implementation slices
    // mid-secret, the masking regex no longer sees a key shape, and the leading
    // fragment persists. Mask-then-truncate removes it whole first.
    const secret = `sk-${"Zq9x".repeat(10)}`;
    const reason = "pad ".repeat(11_250) + secret + "end ".repeat(3_750);
    await appendEvent(base, HASH, "s1", ev({ type: "decision", detail: { decision: "accept", reason } }));
    const line = readFileSync(sessionFilePath(base, HASH, "s1"), "utf8").trim();
    expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(32 * 1024);
    expect(line).not.toContain("Zq9");
    expect(line).not.toContain("sk-");
  });

  it("refuses to persist a smuggled body / detail.body", async () => {
    const base = mkdtempSync(join(tmpdir(), "vd-ledger-"));
    const smuggled = {
      ...ev({ type: "edit" }),
      body: "TOP_LEVEL_BODY_LEAK",
      detail: { file: "src/a.ts", body: "DETAIL_BODY_LEAK" },
    } as unknown as SessionEvent;
    await appendEvent(base, HASH, "s1", smuggled);
    const line = readFileSync(sessionFilePath(base, HASH, "s1"), "utf8").trim();
    expect(line).not.toContain("TOP_LEVEL_BODY_LEAK");
    expect(line).not.toContain("DETAIL_BODY_LEAK");
    const parsed = JSON.parse(line) as Record<string, unknown>;
    expect("body" in parsed).toBe(false);
    expect("body" in (parsed.detail as Record<string, unknown>)).toBe(false);
    expect((parsed.detail as Record<string, unknown>).file).toBe("src/a.ts");
  });

  it("writes a normal small event byte-identical to its serialization", async () => {
    const base = mkdtempSync(join(tmpdir(), "vd-ledger-"));
    const e = ev({ msgToAgent: "drift: prefer async/await here" });
    await appendEvent(base, HASH, "s1", e);
    const line = readFileSync(sessionFilePath(base, HASH, "s1"), "utf8");
    expect(line).toBe(`${JSON.stringify(e)}\n`);
  });
});
