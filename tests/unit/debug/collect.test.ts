import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, test } from "vitest";

import {
  collectDebugBundle,
  probeHookBinary,
  tokenizeCommand,
} from "../../../src/debug/collect.js";
import type { HistoryRecord } from "../../../src/core/history.js";

let tkHome: string;
let fakeHome: string;
const saved: Record<string, string | undefined> = {};

function row(overrides: Partial<HistoryRecord>): string {
  const base: HistoryRecord = {
    timestamp: "2026-06-08T01:00:00.000Z",
    command: "git status",
    handler: "git-status",
    source_adapter: "shell",
    raw_chars: 400,
    output_chars: 100,
    raw_tokens: 100,
    output_tokens: 25,
    saved_tokens: 75,
    savings_pct: 75,
    exit_code: 0,
    duration_ms: 10,
    quality_status: "passed",
    ...overrides,
  };
  return JSON.stringify(base);
}

function writeProject(fp: string, lines: string[]): string {
  const dir = path.join(tkHome, "projects", fp);
  mkdirSync(path.join(dir, "raw"), { recursive: true });
  writeFileSync(path.join(dir, "history.jsonl"), `${lines.join("\n")}\n`);
  return dir;
}

beforeEach(() => {
  saved.TOKEN_KILLER_HOME = process.env.TOKEN_KILLER_HOME;
  saved.HOME = process.env.HOME;
  saved.CLAUDECODE = process.env.CLAUDECODE;
  saved.CLAUDE_CODE_ENTRYPOINT = process.env.CLAUDE_CODE_ENTRYPOINT;
  tkHome = mkdtempSync(path.join(tmpdir(), "tk-debug-home-"));
  fakeHome = mkdtempSync(path.join(tmpdir(), "tk-debug-fakehome-"));
  process.env.TOKEN_KILLER_HOME = tkHome;
  process.env.HOME = fakeHome;
  // Isolate host detection from the live Claude Code session running the tests.
  delete process.env.CLAUDECODE;
  delete process.env.CLAUDE_CODE_ENTRYPOINT;
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  rmSync(tkHome, { recursive: true, force: true });
  rmSync(fakeHome, { recursive: true, force: true });
});

describe("collectDebugBundle — cross-fingerprint merge", () => {
  test("merges history from every project fingerprint into one bundle", async () => {
    writeProject("repo-aaa", [
      row({ command: "git status", timestamp: "2026-06-08T01:00:00.000Z" }),
    ]);
    writeProject("repo-bbb", [row({ command: "git log", timestamp: "2026-06-08T02:00:00.000Z" })]);

    const bundle = await collectDebugBundle({ cwd: process.cwd(), full: false, redact: false });

    expect(bundle.commands).toHaveLength(2);
    expect(bundle.commands.map((c) => c.command)).toEqual(["git status", "git log"]);
    // Sorted by timestamp ascending.
    expect(bundle.commands[0].timestamp < bundle.commands[1].timestamp).toBe(true);
  });
});

describe("collectDebugBundle — anomalies & snapshot reconstruction", () => {
  test("flags the three fault classes and reads the raw snapshot for one", async () => {
    const dir = writeProject("repo-x", [
      row({ command: "git status", quality_status: "passed", exit_code: 0 }), // healthy
      row({ command: "git status", handler: "fallback" }), // parse-error → fallback
      row({
        command: "tsc",
        handler: "tsc",
        exit_code: 2,
        raw_output_path: "projects/repo-x/raw/err.log",
      }), // command-error w/ snapshot
      row({ command: "echo hi", saved_tokens: -9, quality_status: "inflated" }), // inflated
    ]);
    writeFileSync(path.join(dir, "raw", "err.log"), "TS2322 error payload");

    const bundle = await collectDebugBundle({ cwd: process.cwd(), full: false, redact: false });

    const flagged = bundle.anomalies.map((a) => a.record.command).sort();
    expect(flagged).toEqual(["echo hi", "git status", "tsc"]);

    const tsc = bundle.anomalies.find((a) => a.record.command === "tsc")!;
    expect(tsc.snapshot.available).toBe(true);
    expect(tsc.snapshot.content).toContain("TS2322 error payload");
  });

  test("missing snapshot is reported unavailable, never faked", async () => {
    writeProject("repo-x", [
      row({ command: "tsc", exit_code: 2, raw_output_path: "projects/repo-x/raw/gone.log" }),
    ]);
    const bundle = await collectDebugBundle({ cwd: process.cwd(), full: false, redact: false });
    expect(bundle.anomalies[0].snapshot.available).toBe(false);
  });
});

describe("collectDebugBundle — delivery & redaction", () => {
  test("reports NOT wired when no hooks/shim/injection exist (clean home)", async () => {
    writeProject("repo-x", [row({})]);
    const bundle = await collectDebugBundle({ cwd: process.cwd(), full: false, redact: false });
    expect(bundle.delivery.anyWired).toBe(false);
    expect(bundle.delivery.claudeHook.present).toBe(false);
    expect(bundle.delivery.copilotHook.present).toBe(false);
  });

  test("--redact captures snapshot length but not its bytes", async () => {
    const dir = writeProject("repo-x", [
      row({ command: "tsc", exit_code: 2, raw_output_path: "projects/repo-x/raw/err.log" }),
    ]);
    writeFileSync(path.join(dir, "raw", "err.log"), "SECRET_BYTES");

    const bundle = await collectDebugBundle({ cwd: process.cwd(), full: false, redact: true });
    const snap = bundle.anomalies[0].snapshot;
    expect(snap.available).toBe(true);
    expect(snap.content).toBeUndefined();
    expect(snap.bytes).toBe("SECRET_BYTES".length);
  });
});

describe("tokenizeCommand", () => {
  test("splits on whitespace and honors quoted paths with spaces", () => {
    expect(tokenizeCommand('"/a b/node" "/c d/tk" hook claude')).toEqual([
      "/a b/node",
      "/c d/tk",
      "hook",
      "claude",
    ]);
    expect(tokenizeCommand("node /abs/bin/tk hook claude")).toEqual([
      "node",
      "/abs/bin/tk",
      "hook",
      "claude",
    ]);
  });
});

describe("probeHookBinary — does the wired binary actually run", () => {
  test("no installed command → not probed", () => {
    const p = probeHookBinary(undefined);
    expect(p.ran).toBe(false);
    expect(p.ok).toBe(false);
  });

  test("dangling binary path → ran but BROKEN (MODULE_NOT_FOUND)", () => {
    // `node /no/such/tk --version` after stripping the trailing `hook claude`.
    const p = probeHookBinary(`${process.execPath} /no/such/dir/tk hook claude`);
    expect(p.ran).toBe(true);
    expect(p.ok).toBe(false);
    expect(p.detail.toLowerCase()).toMatch(/cannot find module|no such file/);
  });

  test("loadable binary → ran ok with a version line", () => {
    // Strips `hook claude` → runs `node --version`, which prints `vX.Y.Z`, exit 0.
    const p = probeHookBinary(`${process.execPath} hook claude`);
    expect(p.ran).toBe(true);
    expect(p.ok).toBe(true);
    expect(p.exitCode).toBe(0);
    expect(p.detail).toMatch(/^v\d+\./);
  });
});
