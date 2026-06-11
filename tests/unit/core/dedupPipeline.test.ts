import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { runPipeline } from "../../../src/core/pipeline.js";
import { readHistory } from "../../../src/core/history.js";
import { readDedupEvents } from "../../../src/core/dedupLedger.js";
import { runGain } from "../../../src/core/gain.js";
import { makeFilteredResult } from "../../../src/handlers/base.js";
import type { CommandHandler, ParsedCommand, RawResult, TkOptions } from "../../../src/types.js";

const OUT = `On branch main\n${"  modified:   src/file.ts\n".repeat(15)}`;

let home: string;
let cwd: string;

beforeEach(async () => {
  home = await mkdtemp(path.join(tmpdir(), "tk-dedup-pipe-home-"));
  cwd = await mkdtemp(path.join(tmpdir(), "tk-dedup-pipe-cwd-"));
  process.env.TOKEN_KILLER_HOME = home;
  process.env.TK_SESSION_DEDUP = "1";
});

afterEach(async () => {
  delete process.env.TOKEN_KILLER_HOME;
  delete process.env.TK_SESSION_DEDUP;
  vi.restoreAllMocks();
  await rm(home, { recursive: true, force: true });
  await rm(cwd, { recursive: true, force: true });
});

function command(): ParsedCommand {
  return {
    program: "git",
    args: ["status"],
    original: ["git", "status"],
    displayCommand: "git status",
  };
}

function stubHandler(): CommandHandler {
  return {
    name: "git-status",
    traits: { structural: true, cacheable: true, ttlClass: "fast" },
    matches: () => true,
    execute: async () => mkRaw(),
    filter: async (raw, _command, options) =>
      makeFilteredResult({ name: "git-status", traits: { structural: true } }, raw, OUT, options),
  };
}

function mkRaw(): RawResult {
  return {
    command: "git status",
    stdout: `RAWMARK ${"x".repeat(500)}`,
    stderr: "",
    exitCode: 0,
    durationMs: 1,
  };
}

function options(): TkOptions {
  return {
    raw: false,
    stats: false,
    maxLines: 120,
    maxChars: 12000,
    saveRaw: "auto",
    cwd,
    sessionId: "sess-int",
  };
}

function captureStdout(): { text: () => string } {
  const chunks: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
    chunks.push(String(chunk));
    return true;
  });
  return { text: () => chunks.join("") };
}

describe("runPipeline + session dedup — wiring & separated accounting", () => {
  test("a repeated cacheable command emits the marker, not a second ledger-① row", async () => {
    const handler = stubHandler();
    const first = await runPipeline(handler, command(), options());
    const second = await runPipeline(handler, command(), options());

    // First emits the full compressed output; the repeat emits the recoverable marker.
    expect(first.filtered.output).toBe(OUT);
    expect(second.filtered.output).toContain("[tk] unchanged since");
    expect(second.filtered.output).toMatch(/full: \S+/);

    // Ledger ① recorded the first run only — the dedup hit is NOT a second ① row.
    const history = await readHistory(cwd);
    expect(history).toHaveLength(1);

    // The dedup dimension recorded exactly one hit, with real saved tokens.
    const events = await readDedupEvents(cwd);
    expect(events).toHaveLength(1);
    expect(events[0]!.saved_tokens).toBeGreaterThan(0);
    expect(events[0]!.session_id).toBe("sess-int");
    expect(events[0]!.handler).toBe("git-status");
  });

  test("`tk gain` reports dedup on a separate line, never summed into ① commands", async () => {
    const handler = stubHandler();
    await runPipeline(handler, command(), options());
    await runPipeline(handler, command(), options());

    const out = captureStdout();
    const code = await runGain(["--text"], cwd, new Date(), () => {});
    expect(code).toBe(0);
    const text = out.text();

    // ① counts the single fresh compression — the dedup hit did not inflate it.
    expect(text).toContain("Commands: 1");
    // The dedup dimension is its own labeled, never-summed block.
    expect(text).toContain("Session dedup");
    expect(text).toContain("Hits: 1");
    expect(text).toContain("never summed");
  });
});
