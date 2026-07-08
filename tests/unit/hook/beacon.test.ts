// Issue #42 — the optional "ctx active" routing beacon.
//
// Covers the pure helper (env gating + line shape) AND that the two runtime hooks
// (copilot / claude) only attach the beacon when opted in, so the default wire is
// byte-identical and the transparent-rewrite contract is preserved.

import { afterEach, describe, expect, test } from "vitest";

import { HOOK_BEACON_PREFIX, beaconEnabled, rewriteBeacon } from "../../../src/hook/beacon.js";
import { decide as copilotDecide, toHostOutput } from "../../../src/hook/copilot.js";
import { decide as claudeDecide } from "../../../src/hook/claude.js";
import { normalize } from "../../../src/hook/normalize.js";

// Restore CTX_HOOK_BEACON after every test so the default-off cases never leak.
const ORIGINAL = process.env.CTX_HOOK_BEACON;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CTX_HOOK_BEACON;
  else process.env.CTX_HOOK_BEACON = ORIGINAL;
});

describe("beaconEnabled — opt-in gating", () => {
  test("absent → off", () => {
    expect(beaconEnabled({})).toBe(false);
  });
  test("'1' / 'true' / 'yes' → on", () => {
    expect(beaconEnabled({ CTX_HOOK_BEACON: "1" })).toBe(true);
    expect(beaconEnabled({ CTX_HOOK_BEACON: "true" })).toBe(true);
    expect(beaconEnabled({ CTX_HOOK_BEACON: "yes" })).toBe(true);
  });
  test("'0' / 'false' / empty → off (explicit negation)", () => {
    expect(beaconEnabled({ CTX_HOOK_BEACON: "0" })).toBe(false);
    expect(beaconEnabled({ CTX_HOOK_BEACON: "false" })).toBe(false);
    expect(beaconEnabled({ CTX_HOOK_BEACON: "" })).toBe(false);
    expect(beaconEnabled({ CTX_HOOK_BEACON: "  " })).toBe(false);
  });
});

describe("rewriteBeacon — line shape", () => {
  test("off → undefined regardless of command", () => {
    expect(rewriteBeacon("ctx git status", {})).toBeUndefined();
  });
  test("on → 'ctx active: routed <cmd>'", () => {
    const line = rewriteBeacon("ctx git status", { CTX_HOOK_BEACON: "1" });
    expect(line).toBe(`${HOOK_BEACON_PREFIX}: routed ctx git status`);
  });
  test("on with no command → bare prefix", () => {
    expect(rewriteBeacon(undefined, { CTX_HOOK_BEACON: "1" })).toBe(HOOK_BEACON_PREFIX);
    expect(rewriteBeacon("  ", { CTX_HOOK_BEACON: "1" })).toBe(HOOK_BEACON_PREFIX);
  });
});

// The wire-shape contract: default-off must NOT add additionalContext (byte-identical
// to before #42); on, the rewrite carries the beacon WITHOUT touching the rewrite
// itself (command / permissionDecision / updatedInput unchanged).
describe("copilot hook — beacon on rewrite is opt-in", () => {
  function wire(payload: Record<string, unknown>) {
    const ev = normalize({ event: "preToolUse", ...payload });
    return toHostOutput(ev, copilotDecide(ev));
  }

  test("default off → no additionalContext on a rewrite", () => {
    delete process.env.CTX_HOOK_BEACON;
    const out = wire({ toolName: "bash", toolArgs: JSON.stringify({ command: "git status" }) });
    expect(out).not.toBeNull();
    expect(out).not.toHaveProperty("additionalContext");
    expect(out?.modifiedArgs).toEqual({ command: "ctx git status" });
  });

  test("opt-in → additionalContext beacon, rewrite untouched", () => {
    process.env.CTX_HOOK_BEACON = "1";
    const out = wire({ toolName: "bash", toolArgs: JSON.stringify({ command: "git status" }) });
    expect(out?.additionalContext).toBe(`${HOOK_BEACON_PREFIX}: routed ctx git status`);
    // The transparent rewrite is unchanged — beacon is additive only.
    expect(out?.permissionDecision).toBe("allow");
    expect(out?.modifiedArgs).toEqual({ command: "ctx git status" });
  });

  test("opt-in → a NON-rewrite (deny) carries no beacon", () => {
    process.env.CTX_HOOK_BEACON = "1";
    const out = wire({ tool_name: "read_file", tool_input: { filePath: "node_modules/x/i.js" } });
    // deny path: additionalContext must not be the beacon (it's a governance deny).
    expect((out as Record<string, unknown> | null)?.hookSpecificOutput).toBeDefined();
    const hook = (out as { hookSpecificOutput: Record<string, unknown> }).hookSpecificOutput;
    expect(hook.additionalContext).toBeUndefined();
  });
});

describe("claude hook — beacon on rewrite is opt-in", () => {
  function pre(command: string) {
    return { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command } };
  }

  test("default off → updatedInput only, no additionalContext", () => {
    delete process.env.CTX_HOOK_BEACON;
    const out = claudeDecide(pre("git status"));
    expect(out?.hookSpecificOutput).not.toHaveProperty("additionalContext");
    expect(out?.hookSpecificOutput.updatedInput).toEqual({ command: "ctx git status" });
  });

  test("opt-in → additionalContext beacon, updatedInput untouched", () => {
    process.env.CTX_HOOK_BEACON = "1";
    const out = claudeDecide(pre("git status"));
    expect(out?.hookSpecificOutput.additionalContext).toBe(
      `${HOOK_BEACON_PREFIX}: routed ctx git status`,
    );
    expect(out?.hookSpecificOutput.updatedInput).toEqual({ command: "ctx git status" });
  });
});
