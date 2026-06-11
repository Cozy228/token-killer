import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { analyzeHabits, LONG_PROMPT_CHARS } from "../../../src/inspect/habits.js";
import type { SourceDiscovery } from "../../../src/inspect/sources.js";

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tk-habits-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function transcript(name: string, events: object[]): string {
  const file = join(dir, name);
  writeFileSync(file, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  return file;
}
function discovery(transcriptFiles: string[], sessionFiles: string[] = []): SourceDiscovery {
  return { inputType: "vscode", transcriptFiles, sessionFiles, found: true };
}

describe("analyzeHabits", () => {
  test("counts per-session tool-call depth, turns, and prompt lengths", () => {
    const file = transcript("t.jsonl", [
      { type: "session.start", data: { sessionId: "S1" } },
      { type: "user.message", data: { content: "hi" } },
      { type: "assistant.message", data: { toolRequests: [{ name: "a" }, { name: "b" }] } },
      { type: "assistant.message", data: { toolRequests: [{ name: "c" }] } },
    ]);
    const h = analyzeHabits(discovery([file]));
    expect(h.sessions).toBe(1);
    expect(h.total_tool_calls).toBe(3);
    expect(h.avg_tool_calls_per_session).toBe(3);
    expect(h.max_tool_calls_in_session).toBe(3);
    expect(h.prompt_count).toBe(1);
    expect(h.max_prompt_chars).toBe(2);
  });

  test("groups tool calls by session id and averages across sessions", () => {
    const file = transcript("t.jsonl", [
      { type: "session.start", data: { sessionId: "S1" } },
      { type: "assistant.message", data: { toolRequests: [{ name: "a" }, { name: "b" }] } },
      { type: "session.start", data: { sessionId: "S2" } },
      {
        type: "assistant.message",
        data: { toolRequests: [{ name: "c" }, { name: "d" }, { name: "e" }, { name: "f" }] },
      },
    ]);
    const h = analyzeHabits(discovery([file]));
    expect(h.sessions).toBe(2);
    expect(h.total_tool_calls).toBe(6);
    expect(h.avg_tool_calls_per_session).toBe(3);
    expect(h.max_tool_calls_in_session).toBe(4);
  });

  test("flags long prompts but keeps only their lengths (privacy)", () => {
    const longPrompt = "x".repeat(LONG_PROMPT_CHARS + 50);
    const file = transcript("t.jsonl", [
      { type: "session.start", data: { sessionId: "S1" } },
      { type: "user.message", data: { content: longPrompt } },
      { type: "user.message", data: { content: "short" } },
    ]);
    const h = analyzeHabits(discovery([file]));
    expect(h.prompt_count).toBe(2);
    expect(h.long_prompt_count).toBe(1);
    expect(h.max_prompt_chars).toBe(LONG_PROMPT_CHARS + 50);
    // The content itself is never retained on the stats object.
    expect(JSON.stringify(h)).not.toContain("xxxx");
  });

  test("empty / unreadable sources → zeroed stats, never throws", () => {
    expect(analyzeHabits(discovery([])).sessions).toBe(0);
    expect(analyzeHabits(discovery([join(dir, "missing.jsonl")])).sessions).toBe(0);
  });
});
