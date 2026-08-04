import { describe, it, expect } from "vitest";
import type { SessionEvent, HostAgent } from "@/session/types";

/**
 * Multi-host prep: the schema admits future hosts while every producer today
 * still stamps the literal "claude-code". This file is primarily a TYPE-LEVEL
 * check — it fails `tsc` if `agent` regresses to the single-host literal.
 */
describe("HostAgent union", () => {
  it("admits a non-claude-code host at the type level", () => {
    const agent: HostAgent = "codex";
    const ev: SessionEvent = {
      v: 1,
      sid: "s1",
      aid: "evt-1",
      ts: new Date().toISOString(),
      agent,
      projectHash: "abcd1234abcd1234",
      channel: "hook",
      type: "session_start",
      mode: "passive",
      detail: {},
    };
    expect(ev.agent).toBe("codex");
  });

  it("keeps claude-code as a valid member", () => {
    const agent: HostAgent = "claude-code";
    expect(agent).toBe("claude-code");
  });
});
