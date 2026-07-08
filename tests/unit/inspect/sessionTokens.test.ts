import { describe, expect, test } from "vitest";
import { join } from "node:path";

import { analyzeSessionTokens } from "../../../src/inspect/sessionTokens.js";
import type { SourceDiscovery } from "../../../src/inspect/sources.js";

// Real Copilot CLI 1.0.63 event logs (two sessions: one with a tool call, one without).
const FIXTURES = join(__dirname, "../../fixtures/copilot-cli/session-state");
const SESSIONS = [
  join(FIXTURES, "8eb01199-fdf2-45bc-82b9-f7b28ee95d60", "events.jsonl"),
  join(FIXTURES, "714738a3-f23a-4b75-acd1-870027b19036", "events.jsonl"),
];

function discovery(sessionFiles: string[]): SourceDiscovery {
  return { inputType: "copilot-cli", sessionFiles, transcriptFiles: [], found: true };
}

describe("analyzeSessionTokens — measured token detail", () => {
  test("aggregates ground-truth shutdown metrics across sessions", () => {
    const st = analyzeSessionTokens(discovery(SESSIONS));
    expect(st).toBeDefined();
    expect(st!.sessions).toBe(2);
    // Both fixtures recorded measured tokenDetails (input 10+15, output 79+185, …).
    expect(st!.input).toBe(25);
    expect(st!.output).toBe(264);
    expect(st!.cache_write).toBe(17665 + 6864);
    expect(st!.cache_read).toBe(0 + 28679);
    expect(st!.premium_requests).toBeCloseTo(0.66, 2);
  });

  test("rolls per-model usage up by model name", () => {
    const st = analyzeSessionTokens(discovery(SESSIONS))!;
    expect(st.models).toHaveLength(1);
    const m = st.models[0]!;
    expect(m.model).toBe("claude-haiku-4.5");
    expect(m.requests).toBe(3);
    expect(m.reasoningTokens).toBeGreaterThan(0);
  });

  test("keeps the most-recent session's context split", () => {
    const st = analyzeSessionTokens(discovery(SESSIONS))!;
    expect(st.last_context).toBeDefined();
    // Tool definitions dominate the standing per-turn cost in both fixtures.
    expect(st.last_context!.tool_definitions).toBe(8947);
  });

  test("returns undefined when no session recorded measured usage", () => {
    expect(analyzeSessionTokens(discovery([]))).toBeUndefined();
  });

  test("is total — a missing file is skipped, not fatal", () => {
    const st = analyzeSessionTokens(discovery([join(FIXTURES, "does-not-exist", "events.jsonl")]));
    expect(st).toBeUndefined();
  });
});
