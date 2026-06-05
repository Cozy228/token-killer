import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { parseSince, scan } from "../../../src/inspect/scan.js";
import type { SourceDiscovery } from "../../../src/inspect/sources.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "tk-inspect-scan-"));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeTranscript(name: string, records: object[]): string {
  const file = join(dir, name);
  writeFileSync(file, records.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return file;
}

function discovery(transcriptFiles: string[], sessionFiles: string[] = []): SourceDiscovery {
  return { inputType: "vscode", transcriptFiles, sessionFiles, found: true };
}

describe("scan — aggregation & ranking", () => {
  test("aggregates shell + direct tools into ranked opportunities", () => {
    const file = writeTranscript("t.jsonl", [
      { toolName: "bash", toolArgs: JSON.stringify({ command: "git status" }), toolResult: "x".repeat(100) },
      { toolName: "bash", toolArgs: JSON.stringify({ command: "git status" }), toolResult: "x".repeat(300) },
      { tool_name: "read_file", tool_input: { filePath: "src/a.ts" }, tool_response: "y".repeat(50) },
    ]);
    const r = scan(discovery([file]));
    expect(r.tool_event_count).toBe(3);
    expect(r.transcript_coverage).toBe(1);

    const git = r.opportunities.find((o) => o.key === "git status");
    expect(git).toBeDefined();
    expect(git!.count).toBe(2);
    expect(git!.total_output_chars).toBe(400);
    expect(git!.max_output_chars).toBe(300);
    expect(git!.avg_output_chars).toBe(200);
    expect(git!.kind).toBe("shell");
    expect(git!.success_count).toBe(2);

    // Ranked by output volume → git (400) before read_file (50).
    expect(r.opportunities[0].key).toBe("git status");
  });

  test("shell key is sanitized — no argument values leak", () => {
    const file = writeTranscript("t.jsonl", [
      { toolName: "bash", toolArgs: JSON.stringify({ command: "rg SECRET_PATTERN ./src/secrets" }), toolResult: "" },
    ]);
    const r = scan(discovery([file]));
    expect(r.opportunities[0].key).toBe("rg");
    expect(JSON.stringify(r)).not.toContain("SECRET_PATTERN");
    expect(JSON.stringify(r)).not.toContain("secrets");
  });

  test("failure detection via exitCode / isError", () => {
    const file = writeTranscript("t.jsonl", [
      { toolName: "bash", toolArgs: JSON.stringify({ command: "npm test" }), exitCode: 1, toolResult: "boom" },
      { toolName: "bash", toolArgs: JSON.stringify({ command: "npm test" }), toolResult: "ok" },
    ]);
    const r = scan(discovery([file]));
    const npm = r.opportunities.find((o) => o.key === "npm test")!;
    expect(npm.failure_count).toBe(1);
    expect(npm.success_count).toBe(1);
  });

  test("session inventory and transcript coverage are NOT collapsed", () => {
    const sess = join(dir, "s.jsonl");
    writeFileSync(sess, [JSON.stringify({ id: "a" }), JSON.stringify({ id: "b" })].join("\n") + "\n");
    const withEvents = writeTranscript("t1.jsonl", [
      { toolName: "bash", toolArgs: JSON.stringify({ command: "git log" }), toolResult: "x" },
    ]);
    const noEvents = writeTranscript("t2.jsonl", [{ note: "no tool here" }]);
    const r = scan(discovery([withEvents, noEvents], [sess]));
    expect(r.session_inventory).toBe(2);
    expect(r.transcript_coverage).toBe(1); // only t1 had a tool event
  });

  test("non-tool records are ignored", () => {
    const file = writeTranscript("t.jsonl", [{ role: "user", text: "hi" }, { kind: "summary" }]);
    expect(scan(discovery([file])).tool_event_count).toBe(0);
  });

  test("malformed JSON lines count as coverage errors, do not throw", () => {
    const file = join(dir, "bad.jsonl");
    writeFileSync(file, '{"toolName":"bash"}\n}{ not json\n');
    const r = scan(discovery([file]));
    expect(r.coverage_errors).toBe(1);
    expect(r.tool_event_count).toBe(1);
  });

  test("unreadable transcript file → coverage error, no throw", () => {
    const r = scan(discovery([join(dir, "does-not-exist.jsonl")]));
    expect(r.coverage_errors).toBe(1);
  });
});

describe("scan — time window & session filters", () => {
  const base = Date.parse("2026-06-01T00:00:00.000Z");
  function tsRecord(command: string, ts: string | undefined, session?: string) {
    const rec: Record<string, unknown> = {
      toolName: "bash",
      toolArgs: JSON.stringify({ command }),
      toolResult: "x",
    };
    if (ts !== undefined) rec.timestamp = ts;
    if (session !== undefined) rec.sessionId = session;
    return rec;
  }

  test("--since drops older records and counts unknown-time separately", () => {
    const file = writeTranscript("t.jsonl", [
      tsRecord("git status", "2026-06-05T00:00:00.000Z"), // in window
      tsRecord("git diff", "2026-05-01T00:00:00.000Z"), // too old
      tsRecord("git log", undefined), // unknown-time
    ]);
    const cutoff = Date.parse("2026-06-04T00:00:00.000Z");
    const r = scan(discovery([file]), { sinceMs: cutoff });
    expect(r.tool_event_count).toBe(1);
    expect(r.opportunities[0].key).toBe("git status");
    expect(r.unknown_time_records).toBe(1);
  });

  test("--session restricts to a single session", () => {
    const file = writeTranscript("t.jsonl", [
      tsRecord("git status", "2026-06-05T00:00:00.000Z", "S1"),
      tsRecord("git diff", "2026-06-05T00:00:00.000Z", "S2"),
    ]);
    const r = scan(discovery([file]), { session: "S1" });
    expect(r.tool_event_count).toBe(1);
    expect(r.opportunities[0].key).toBe("git status");
  });

  void base;
});

describe("parseSince", () => {
  test("valid durations", () => {
    expect(parseSince("7d")).toBe(7 * 86_400_000);
    expect(parseSince("24h")).toBe(24 * 3_600_000);
    expect(parseSince("30m")).toBe(30 * 60_000);
  });
  test("invalid → undefined", () => {
    expect(parseSince("7")).toBeUndefined();
    expect(parseSince("abc")).toBeUndefined();
    expect(parseSince("7w")).toBeUndefined();
  });
});
