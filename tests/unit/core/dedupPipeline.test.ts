import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { emitThenCommit } from "../../../src/core/emit.js";
import { runPipeline } from "../../../src/core/pipeline.js";
import { readHistory } from "../../../src/core/history.js";
import { readDedupEvents } from "../../../src/core/dedupLedger.js";
import { dedupStoreFile } from "../../../src/core/dataDir.js";
import { entryKey, normalizeCommand, readStore } from "../../../src/core/dedupStore.js";
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
    // Accounting is now deferred to commit() — emit-then-commit, exactly as runCompress
    // drives it. The second run's HIT decision depends on the first run's store write,
    // so commit each before the next, mirroring the real per-command lifecycle.
    const first = await runPipeline(handler, command(), options());
    await first.commit();
    const second = await runPipeline(handler, command(), options());
    await second.commit();

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
    await runPipeline(handler, command(), options()).then((r) => r.commit());
    await runPipeline(handler, command(), options()).then((r) => r.commit());

    const out = captureStdout();
    const code = await runGain(["--text"], cwd, new Date(), () => {});
    expect(code).toBe(0);
    const text = out.text();

    // ① counts the single fresh compression — the dedup hit did not inflate it.
    expect(text).toContain("Total commands:   1");
    // The dedup dimension is its own labeled, never-summed block.
    expect(text).toContain("Session dedup");
    expect(text).toContain("Hits: 1");
    expect(text).toContain("never summed");
  });
});

describe("runPipeline — accounting deferred to commit() (ordering invariant)", () => {
  test("the history row is written by commit(), not before it", async () => {
    const handler = stubHandler();
    const result = await runPipeline(handler, command(), options());

    // Before commit: the decision is made and `filtered` is ready to emit, but the
    // ledger-① history row has NOT been written yet — it is off the latency path.
    expect(await readHistory(cwd)).toHaveLength(0);

    await result.commit();
    // After commit: exactly the one row lands.
    expect(await readHistory(cwd)).toHaveLength(1);
  });

  test("the MISS-path dedup store upsert is written by commit(), not before it", async () => {
    const handler = stubHandler();
    const result = await runPipeline(handler, command(), options());
    const store = dedupStoreFile(cwd);
    const key = entryKey(normalizeCommand(command()));

    // Before commit: a fresh MISS makes no store entry — the hot-path lock+rename
    // write is deferred until after the output would have been emitted.
    const before = existsSync(store) ? (await readStore(store)).entries[key] : undefined;
    expect(before).toBeUndefined();

    await result.commit();
    // After commit: the entry exists, ready to drive a later HIT.
    expect((await readStore(store)).entries[key]).toBeDefined();
  });

  test("a commit() dedup-upsert failure is absorbed — never throws, output stays intact", async () => {
    const handler = stubHandler();
    // The MISS decision captures `dedupStoreFile(cwd)` (= projectDataDir/dedup.json)
    // NOW, while TOKEN_KILLER_HOME is still valid — Codex's finding was that switching
    // the home AFTER this point leaves the captured path writable, so the upsert
    // SUCCEEDS and only recordHistory observes the break. To genuinely fail the dedup
    // write we sabotage the captured path itself, after the decision.
    const result = await runPipeline(handler, command(), options());
    const store = dedupStoreFile(cwd);
    const key = entryKey(normalizeCommand(command()));
    const dataDir = path.dirname(store); // upsertEntry's mkdir target

    // Pre-state: the fresh MISS has not persisted yet, and the project data dir does
    // not exist (so the decision phase's readStore saw an empty store, as intended).
    expect(existsSync(store)).toBe(false);
    expect(existsSync(dataDir)).toBe(false);

    // Put a regular FILE exactly where the captured store's parent directory must be.
    // Now every write under it is impossible: upsertEntry's `mkdir(dirname(file))`
    // throws (EEXIST/ENOTDIR over a file), so the lock+rename write never runs.
    await mkdir(path.dirname(dataDir), { recursive: true });
    await writeFile(dataDir, "x");

    // NEGATIVE-TEST the technique: prove a write to the captured store path genuinely
    // fails before asserting the pipeline absorbs it (otherwise the test would be
    // vacuous, exactly the overclaim Codex caught).
    // The failure code differs by platform — POSIX reports ENOTDIR (writing "through"
    // a file), Windows reports ENOENT. Either proves the write genuinely fails, which
    // is all this negative-test needs.
    const writeErr = await writeFile(store, "{}").catch((e: unknown) => e as NodeJS.ErrnoException);
    expect(["ENOTDIR", "ENOENT"]).toContain(writeErr?.code);

    // commit() must swallow the now-guaranteed upsert failure — the command already
    // ran, so a throw here would re-spawn it via the cli fail-open (C6).
    await expect(result.commit()).resolves.toBeUndefined();

    // The dedup write really did NOT persist (the failure was absorbed, not silently
    // succeeded-elsewhere): the store path is still blocked by the file, no entry.
    expect(existsSync(store)).toBe(false);
    await rm(dataDir, { force: true });
    expect(existsSync(store) ? (await readStore(store)).entries[key] : undefined).toBeUndefined();

    // Output is intact regardless of the accounting failure.
    expect(result.filtered.output).toBe(OUT);
  });
});

describe("emitThenCommit — stdout-before-commit ordering (issue #5 regression)", () => {
  test("every stdout write happens BEFORE commit() runs", async () => {
    const handler = stubHandler();
    const filtered = await handler.filter(mkRaw(), command(), options());
    const raw: RawResult = { ...mkRaw(), exitCode: 0 };

    // Record the interleaving of stdout writes vs the deferred commit. If a future
    // edit moves `await commit()` ahead of the stdout writes (the exact user-visible
    // regression this issue prevents), `commit` lands first and the assertion fails.
    const order: string[] = [];
    vi.spyOn(process.stdout, "write").mockImplementation((chunk: unknown) => {
      order.push(`write:${String(chunk).slice(0, 8)}`);
      return true;
    });
    const commit = vi.fn<() => Promise<void>>(async () => {
      order.push("commit");
    });

    const code = await emitThenCommit(filtered, raw, command(), options(), commit);

    expect(code).toBe(0);
    expect(commit).toHaveBeenCalledTimes(1);
    // At least one stdout write occurred, and commit is strictly LAST.
    const commitIndex = order.indexOf("commit");
    expect(commitIndex).toBe(order.length - 1);
    expect(order.slice(0, commitIndex).every((e) => e.startsWith("write:"))).toBe(true);
    expect(commitIndex).toBeGreaterThan(0);
  });
});
