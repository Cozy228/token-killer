import { homedir } from "node:os";

import { describe, expect, test } from "vitest";

import type { DebugBundle } from "../../../src/debug/collect.js";
import { renderDebug } from "../../../src/debug/render.js";
import type { HistoryRecord } from "../../../src/core/history.js";

function record(overrides: Partial<HistoryRecord> = {}): HistoryRecord {
  return {
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
}

function bundle(overrides: Partial<DebugBundle> = {}): DebugBundle {
  const base: DebugBundle = {
    generatedAt: "2026-06-08T07:00:00.000Z",
    redacted: false,
    full: false,
    env: {
      version: "0.1.0",
      platform: "linux",
      arch: "x64",
      nodeVersion: "v22.0.0",
      detectedHost: "copilot-cli",
      contexaHome: "/home/u/.contexa",
      cliPath: "/home/u/cli.js",
      execPath: "/usr/bin/node",
    },
    delivery: {
      claudeHook: {
        path: "/c/settings.json",
        present: false,
        pointsAtTk: false,
        command: "node cli hook claude",
        exec: { ran: false, ok: false, exitCode: null, detail: "no claude hook installed" },
      },
      copilotHook: { path: "/c/ctx.json", present: true, managed: true },
      injection: { path: "/c/inj.md", present: false },
      shim: {
        dir: "/s",
        dirExists: true,
        manifest: { version: "0.1.0", schema: 1, programs: 30 },
        onPath: true,
        pathPosition: 0,
        firstOnPath: true,
        probe: { pass: true, resolved: "/s/git", program: "git" },
      },
      rewriteProbes: [{ command: "git status", decision: "rewrite", detail: "ctx git status" }],
      recentFailures: [],
      anyWired: true,
      brokenHook: false,
    },
    commands: [],
    anomalies: [],
    omittedPayloads: [],
    aggregates: {
      summary: {
        estimate_kind: "measured",
        commands: 0,
        raw_tokens: 0,
        output_tokens: 0,
        saved_tokens: 0,
        savings_pct: 0,
        avg_savings_per_command: 0,
        total_duration_ms: 0,
        by_handler: [],
        quality_status_counts: {},
      },
      byHost: [],
      byCommand: [],
      sourceAdapterMix: {},
    },
    governance: {
      estimate_kind: "opportunity",
      denied_large_reads: 0,
      suggested_broad_searches: 0,
      denied_large_prompts: 0,
      suggested_large_prompts: 0,
      avoided_tokens_estimate: 0,
      avoided_tokens_estimate_kind: "heuristic",
    },
    debugLog: { path: "/d/debug.log", available: false },
    hostConfigs: [],
  };
  return { ...base, ...overrides };
}

describe("renderDebug — delivery health", () => {
  test("shows the NOT-wired banner only when nothing is wired", () => {
    const wired = renderDebug(bundle());
    expect(wired).not.toContain("NOT wired into any host");

    const notWired = renderDebug(
      bundle({
        delivery: {
          ...bundle().delivery,
          anyWired: false,
          copilotHook: { path: "/c/ctx.json", present: false, managed: false },
          shim: { ...bundle().delivery.shim, onPath: false, pathPosition: -1, firstOnPath: false },
        },
      }),
    );
    expect(notWired).toContain("NOT wired into any host");
  });

  test("wired but the binary fails to run → INSTALLED-BUT-BROKEN, not a clean wired", () => {
    const out = renderDebug(
      bundle({
        delivery: {
          ...bundle().delivery,
          anyWired: true,
          brokenHook: true,
          claudeHook: {
            path: "/c/settings.json",
            present: true,
            pointsAtTk: true,
            command: "node /abs/bin/ctx hook claude",
            exec: {
              ran: true,
              ok: false,
              exitCode: 1,
              detail: "Cannot find module '/abs/bin/ctx'",
            },
          },
        },
      }),
    );
    expect(out).toContain("INSTALLED-BUT-BROKEN");
    expect(out).toContain("Cannot find module");
    expect(out).toContain("binary runs: **NO — BROKEN");
    // Must NOT show the healthy banner.
    expect(out).not.toContain("wired into at least one tier");
  });

  test("wired and the binary runs → healthy, shows the version line", () => {
    const out = renderDebug(
      bundle({
        delivery: {
          ...bundle().delivery,
          anyWired: true,
          brokenHook: false,
          claudeHook: {
            path: "/c/settings.json",
            present: true,
            pointsAtTk: true,
            command: "node /abs/bin/ctx hook claude",
            exec: { ran: true, ok: true, exitCode: 0, detail: "0.1.0" },
          },
        },
      }),
    );
    expect(out).toContain("binary runs: YES ✅");
    expect(out).not.toContain("INSTALLED-BUT-BROKEN");
  });
});

describe("renderDebug — anomalies & volume gate", () => {
  const anomalyRecord = record({
    command: "tsc",
    handler: "tsc",
    exit_code: 2,
    quality_status: "passed",
    raw_output_path: "projects/p/raw/x.log",
  });

  test("anomaly payload is rendered in full, never truncated", () => {
    const payload = "X".repeat(5000);
    const out = renderDebug(
      bundle({
        anomalies: [
          { record: anomalyRecord, snapshot: { path: "x.log", available: true, content: payload } },
        ],
      }),
    );
    expect(out).toContain(payload);
    expect(out).toContain("flagged: **exit 2**");
  });

  test("missing snapshot is annotated honestly, not faked", () => {
    const out = renderDebug(
      bundle({ anomalies: [{ record: anomalyRecord, snapshot: { path: "", available: false } }] }),
    );
    expect(out).toContain("snapshot unavailable");
    expect(out).toContain("NOT reconstructable");
  });

  test("suppressed non-anomaly payloads print a count + --full hint, not silent truncation", () => {
    const out = renderDebug(
      bundle({
        omittedPayloads: [
          {
            record: record({ raw_output_path: "a.log" }),
            snapshot: { path: "a.log", available: true },
          },
          {
            record: record({ raw_output_path: "b.log" }),
            snapshot: { path: "b.log", available: true },
          },
        ],
      }),
    );
    expect(out).toContain("2 non-anomaly payloads suppressed");
    expect(out).toContain("--full");
  });

  test("--full renders the previously suppressed payloads", () => {
    const out = renderDebug(
      bundle({
        full: true,
        omittedPayloads: [
          {
            record: record({ command: "ls", raw_output_path: "a.log" }),
            snapshot: { path: "a.log", available: true, content: "DIR LISTING" },
          },
        ],
      }),
    );
    expect(out).toContain("Full payloads (--full)");
    expect(out).toContain("DIR LISTING");
  });
});

describe("renderDebug — markdown safety & volume", () => {
  // A command carrying every table/heading-breaking char: pipe, backtick (command
  // substitution), `<tag>` (greps), newline. Raw interpolation would split the row,
  // escape the code span, or inject HTML into the §4 heading.
  const nasty = "grep -n '<h1>' a | `id` && rg \\\n  x";

  test("§3 command cells survive pipes/backticks/newlines without breaking the table", () => {
    const out = renderDebug(bundle({ commands: [record({ command: nasty })] }));
    // No literal newline leaked into the table (row stays on one line).
    const row = out.split("\n").find((l) => l.includes("grep -n") && l.startsWith("| "));
    expect(row).toBeDefined();
    expect(row).toContain("\\|"); // pipe escaped
    expect(row).toContain("``"); // delimiter widened past the inner backticks
  });

  test("§4 anomaly heading wraps the command in code so `<tags>` can't inject HTML", () => {
    const out = renderDebug(
      bundle({
        anomalies: [
          {
            record: record({
              command: "grep '<script>' x",
              exit_code: 1,
              raw_output_path: "x.log",
            }),
            snapshot: { path: "x.log", available: true, content: "boom" },
          },
        ],
      }),
    );
    // The heading carries the command inside a code span, not as a raw `### <script>`.
    expect(out).toContain("### `grep '<script>' x`");
    expect(out).not.toContain("### grep '<script>' x");
  });

  test("§5 aggregate keys cap an over-long command with an explicit marker", () => {
    const longCmd = `wc -l ${"file ".repeat(200)}`.trim();
    const out = renderDebug(
      bundle({
        aggregates: {
          ...bundle().aggregates,
          byCommand: [{ key: longCmd, count: 1, raw: 100, saved: 50, pct: 50 }],
        },
      }),
    );
    expect(out).toMatch(/… \(\+\d+ chars\)/);
    expect(out).not.toContain(longCmd); // full string not dumped as a table key
  });
});

describe("renderDebug — redaction", () => {
  test("--redact emits no command text or payload bytes, only lengths/labels", () => {
    const secretCmd = "git log --grep=SECRET_TOKEN";
    const secretPayload = "PAYLOAD_SECRET_BYTES";
    const out = renderDebug(
      bundle({
        redacted: true,
        commands: [record({ command: secretCmd })],
        anomalies: [
          {
            record: record({ command: secretCmd, exit_code: 1, raw_output_path: "x.log" }),
            snapshot: { path: "x.log", available: true, bytes: 999, content: secretPayload },
          },
        ],
        hostConfigs: [
          {
            label: "claude-code settings.json",
            path: "/c/s.json",
            available: true,
            bytes: 120,
            content: "HOOK_SECRET",
          },
        ],
      }),
    );
    expect(out).not.toContain(secretCmd);
    expect(out).not.toContain(secretPayload);
    expect(out).not.toContain("HOOK_SECRET");
    expect(out).toContain("[redacted]");
    expect(out).toContain("body redacted");
  });
});

describe("renderDebug — host config home scrub", () => {
  test("rewrites the home dir to ~ in config bodies (non-redact)", () => {
    const home = homedir();
    const out = renderDebug(
      bundle({
        hostConfigs: [
          {
            label: "claude-code settings.json",
            path: `${home}/.claude/settings.json`,
            available: true,
            bytes: 50,
            content: `{"command":"${home}/cli.js hook claude"}`,
          },
        ],
      }),
    );
    expect(out).not.toContain(`${home}/cli.js`);
    expect(out).toContain("~/cli.js");
  });

  // The bundle is meant to be SHARED with a maintainer, so the home dir must not
  // survive ANYWHERE — including §3 command text and §4 payload snapshots, which the
  // per-field scrub never reached (a real leak caught on a Windows acceptance run).
  test("scrubs the home dir from command text and anomaly payloads, not just configs", () => {
    const home = homedir();
    const out = renderDebug(
      bundle({
        commands: [record({ command: `cat ${home}/secret/notes.txt` })],
        anomalies: [
          {
            record: record({ command: `grep token ${home}/secret/notes.txt`, exit_code: 1 }),
            snapshot: {
              available: true,
              path: "notes.log",
              bytes: 20,
              content: `match in ${home}/secret`,
            },
          },
        ],
        aggregates: {
          ...bundle().aggregates,
          byCommand: [
            { key: `cat ${home}/secret/notes.txt`, count: 1, raw: 100, saved: 50, pct: 50 },
          ],
        },
      }),
    );
    expect(out).not.toContain(home);
    expect(out).toContain("~/secret");
  });
});
