// Live-host protocol smoke (issue #21).
//
// protocol-matrix.test.ts drives tk's protocol pipeline IN-PROCESS — it mocks
// process.stdin and calls normalizeStdin/decide/toHostOutput directly. That proves the
// emitted SHAPE is host-conformant, but it never exercises the REAL command a host
// actually invokes: the `tk hook copilot` PROCESS reading wire bytes from stdin,
// writing the rewrite to stdout, and exiting 0. This smoke spawns that real process
// with the exact bytes a host pipes in and asserts the emitted JSON + exit code — the
// closest faithful proxy to "the host received and can apply it" short of driving VS
// Code / Copilot CLI themselves.
//
// OPT-IN ONLY. It spawns a tsx subprocess per case (slower, and not something the unit
// gate should pay on every run), so the whole suite is SKIPPED unless
// `TK_LIVE_HOST_SMOKE=1` and is intentionally NOT part of `pnpm test:ci`. Run it with:
//
//   TK_LIVE_HOST_SMOKE=1 pnpm exec vitest run tests/unit/hook/live-host-smoke.test.ts
//
// Determinism: the rewrite of `git status` is presence-gated on `git` being on PATH;
// off Windows the gate is always open and on any dev/host box `git` is present (the
// same basis protocol-matrix relies on), so the rewrite fires deterministically.

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { describe, expect, test } from "vitest";

const ENABLED = process.env.TK_LIVE_HOST_SMOKE === "1";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const cli = join(repoRoot, "src/cli.ts");
const tsxLoader = pathToFileURL(join(repoRoot, "node_modules/tsx/dist/loader.mjs")).href;

// Spawn the REAL `tk hook copilot` process and pipe `wire` to its stdin, exactly as a
// host does. Returns the spawn result (status + stdout).
function runHook(wire: string) {
  return spawnSync(process.execPath, ["--import", tsxLoader, cli, "hook", "copilot"], {
    cwd: repoRoot,
    encoding: "utf8",
    input: wire,
    timeout: 20000,
    env: { ...process.env },
  });
}

describe.skipIf(!ENABLED)("live-host protocol smoke (TK_LIVE_HOST_SMOKE=1)", () => {
  test("VS Code run_in_terminal wire → real process emits the updatedInput rewrite, exit 0", () => {
    const wire = JSON.stringify({
      hook_event_name: "PreToolUse",
      tool_name: "run_in_terminal",
      tool_input: { command: "git status", explanation: "check tree", mode: "sync" },
    });
    const r = runHook(wire);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    // updatedInput REPLACES the tool input wholesale and VS Code validates it against
    // run_in_terminal's schema, so every original field must survive with only
    // `command` rewritten (the #19 contract, now proven through the real process).
    expect(out.hookSpecificOutput.permissionDecision).toBe("allow");
    expect(out.hookSpecificOutput.updatedInput).toEqual({
      command: "tk git status",
      explanation: "check tree",
      mode: "sync",
    });
  });

  test("Copilot CLI powershell wire → real process emits the modifiedArgs rewrite, exit 0", () => {
    const wire = JSON.stringify({
      eventName: "preToolUse",
      toolName: "powershell",
      toolArgs: JSON.stringify({ command: "git status", mode: "sync" }),
    });
    const r = runHook(wire);
    expect(r.status).toBe(0);
    const out = JSON.parse(r.stdout);
    expect(out.modifiedArgs).toEqual({ command: "tk git status", mode: "sync" });
    // Copilot CLI reads a FLAT shape — no VS Code wrapper.
    expect("hookSpecificOutput" in out).toBe(false);
  });

  test("malformed wire → real process fails open: exit 0, emits nothing on stdout", () => {
    // Copilot CLI's preToolUse is fail-CLOSED on a crashing hook, so the real process
    // must never throw: exit 0 and write nothing (the host then runs the tool unchanged).
    const r = runHook("{ not json");
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });
});
