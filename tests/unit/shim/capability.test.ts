import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildDeliveryMatrix,
  deliveryStatePath,
  hostVersionFromPreflight,
  installedTierIds,
  type MatrixDeps,
  readDeliveryState,
  recordInstall,
  renderDeliveryMatrix,
  updateDeliveryState,
  writeDeliveryState,
} from "../../../src/shim/capability.js";
import type { PreflightCheck } from "../../../src/shim/preflight.js";

// Unit tests for the ADR 0012 #7 delivery capability matrix. The builder is pure
// (all signals injected), so no real PATH probe / host config is touched. The
// persistence tests use a temp TOKEN_KILLER_HOME-style dir passed explicitly to the
// read/write helpers (which all take an optional `home`), so they never touch the
// real ~/.token-killer.

let home: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-cap-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

// A fully-absent baseline so each test flips only the signals it cares about.
function baseDeps(overrides: Partial<MatrixDeps> = {}): MatrixDeps {
  return {
    host: "copilot-cli",
    home,
    env: {},
    copilotHookStatus: () => ({
      present: false,
      path: "/h/.copilot/hooks/tk-rewrite.json",
      managed: false,
    }),
    claudeStatus: () => ({ present: false, path: "/h/.claude/settings.json", pointsAtTk: false }),
    shimManifest: () => null,
    shimDirPath: "/h/.token-killer/shim",
    shimProbe: () => ({ pass: false, resolved: null }),
    injectionPath: "/h/.copilot/copilot-instructions.md",
    guidanceFile: "/h/.claude/TK.md",
    guidanceLoaderPath: "/h/.claude/CLAUDE.md",
    fileExists: () => false,
    historyRecords: [],
    preflight: [],
    state: { version: 1 },
    ...overrides,
  };
}

function tier(matrix: ReturnType<typeof buildDeliveryMatrix>, id: string) {
  const t = matrix.tiers.find((x) => x.tier === id);
  if (!t) throw new Error(`tier ${id} missing`);
  return t;
}

describe("buildDeliveryMatrix (live-derived)", () => {
  test("all-absent matrix marks every tier not installed", () => {
    const m = buildDeliveryMatrix(baseDeps());
    expect(m.tiers.every((t) => !t.installed)).toBe(true);
    // The six tiers are all present in the matrix.
    expect(m.tiers.map((t) => t.tier).sort()).toEqual(
      ["claude-hook", "copilot-hook", "guidance", "injection", "shim", "vscode-hook"].sort(),
    );
  });

  test("copilot hook present is derived from copilotHookStatus", () => {
    const m = buildDeliveryMatrix(
      baseDeps({
        copilotHookStatus: () => ({
          present: true,
          path: "/h/.copilot/hooks/tk-rewrite.json",
          managed: true,
        }),
      }),
    );
    expect(tier(m, "copilot-hook").installed).toBe(true);
    // VS Code hook SHARES the same ~/.copilot/hooks file, so it reads as present too.
    expect(tier(m, "vscode-hook").installed).toBe(true);
    expect(tier(m, "vscode-hook").detail).toContain("shared ~/.copilot/hooks");
  });

  // Issue #26: a hook that is PRESENT but not tk's (unmanaged copilot config, or a
  // claude hook that does not point at tk) must NOT read as installed — installed
  // means "wired to tk", not "some hook file exists". The foreign file is still shown
  // in the detail so it stays diagnosable.
  test("an unmanaged copilot hook is present-but-foreign: NOT installed, but disclosed", () => {
    const m = buildDeliveryMatrix(
      baseDeps({
        copilotHookStatus: () => ({ present: true, path: "/x/tk-rewrite.json", managed: false }),
      }),
    );
    expect(tier(m, "copilot-hook").installed).toBe(false);
    expect(tier(m, "copilot-hook").detail).toContain("NOT tk-managed");
    expect(tier(m, "copilot-hook").detail).toContain("/x/tk-rewrite.json");
    // The VS Code row shares that file, so it is NOT installed either.
    expect(tier(m, "vscode-hook").installed).toBe(false);
    expect(tier(m, "vscode-hook").detail).toContain("NOT tk-managed");
    // And with no tk-managed VS Code hook, the per-host policy line is n/a (not "unknown").
    expect(tier(m, "vscode-hook").blockedByPolicy).toContain("n/a");
  });

  test("a claude hook that does NOT point at tk is present-but-foreign: NOT installed", () => {
    const m = buildDeliveryMatrix(
      baseDeps({
        claudeStatus: () => ({
          present: true,
          path: "/h/.claude/settings.json",
          pointsAtTk: false,
        }),
      }),
    );
    expect(tier(m, "claude-hook").installed).toBe(false);
    expect(tier(m, "claude-hook").detail).toContain("does not point at tk");
    expect(tier(m, "claude-hook").detail).toContain("/h/.claude/settings.json");
  });

  test("claude hook present + pointsAtTk derived from claudeStatus", () => {
    const m = buildDeliveryMatrix(
      baseDeps({
        claudeStatus: () => ({ present: true, path: "/h/.claude/settings.json", pointsAtTk: true }),
      }),
    );
    expect(tier(m, "claude-hook").installed).toBe(true);
    expect(tier(m, "claude-hook").detail).toContain("points at tk");
  });

  test("shim installed reports probe verdict and TTY opt-in from env", () => {
    const m = buildDeliveryMatrix(
      baseDeps({
        shimManifest: () => ({ programs: ["git", "rg"], version: "0.1.0" }),
        shimProbe: () => ({ pass: true, resolved: "/h/.token-killer/shim/git" }),
        env: { TK_COMPRESS_TTY: "1" },
      }),
    );
    const shim = tier(m, "shim");
    expect(shim.installed).toBe(true);
    expect(shim.detail).toContain("2 wrappers");
    expect(shim.detail).toContain("probe PASS");
    expect(shim.detail).toContain("TTY opt-in on");
  });

  test("shim installed but TTY off and probe FAIL is surfaced honestly", () => {
    const m = buildDeliveryMatrix(
      baseDeps({
        shimManifest: () => ({ programs: ["git"], version: "0.1.0" }),
        shimProbe: () => ({ pass: false, resolved: "/usr/bin/git" }),
        env: {},
      }),
    );
    expect(tier(m, "shim").detail).toContain("probe FAIL");
    expect(tier(m, "shim").detail).toContain("TTY opt-in off");
  });

  test("injection + guidance presence is a plain file-existence read", () => {
    const present = new Set(["/h/.copilot/copilot-instructions.md", "/h/.claude/TK.md"]);
    const m = buildDeliveryMatrix(baseDeps({ fileExists: (p) => present.has(p) }));
    expect(tier(m, "injection").installed).toBe(true);
    expect(tier(m, "guidance").installed).toBe(true);
  });

  test("guidance counts the loader file when there is no standalone file (copilot-cli)", () => {
    // copilot-cli inlines guidance into copilot-instructions.md and has no standalone
    // TK.md, so only the loader path exists.
    const m = buildDeliveryMatrix(
      baseDeps({
        guidanceFile: undefined,
        guidanceLoaderPath: "/h/.copilot/copilot-instructions.md",
        fileExists: (p) => p === "/h/.copilot/copilot-instructions.md",
      }),
    );
    expect(tier(m, "guidance").installed).toBe(true);
    expect(tier(m, "guidance").detail).toContain("inlined into loader");
  });
});

// Issue #26: fired / blocked-by-policy are PER-HOST signals on the hook tiers, not
// single global matrix fields, so status can report each host's hook state separately.
describe("fired / blocked-by-policy (per-host, honest best-effort)", () => {
  test('fired is attached to EACH hook tier (and "not tracked" with no rows)', () => {
    const m = buildDeliveryMatrix(baseDeps({ historyRecords: [] }));
    for (const id of ["copilot-hook", "claude-hook", "vscode-hook"]) {
      expect(tier(m, id).fired, id).toContain("not tracked");
    }
    // Non-hook tiers carry NO fired signal.
    expect(tier(m, "shim").fired).toBeUndefined();
    expect(tier(m, "injection").fired).toBeUndefined();
    expect(tier(m, "guidance").fired).toBeUndefined();
  });

  test("shell-only history rows do NOT count as hook activity", () => {
    const m = buildDeliveryMatrix(
      baseDeps({
        historyRecords: [{ timestamp: "2026-01-01T00:00:00Z", source_adapter: "shell" }],
      }),
    );
    expect(tier(m, "copilot-hook").fired).toContain("not tracked");
  });

  test("hook-runtime FAILURE rows surface the last activity timestamp per host", () => {
    const m = buildDeliveryMatrix(
      baseDeps({
        historyRecords: [
          { timestamp: "2026-01-01T00:00:00Z", source_adapter: "terminal_tool" },
          { timestamp: "2026-02-02T00:00:00Z", source_adapter: "direct_tool" },
          { timestamp: "2026-01-15T00:00:00Z", source_adapter: "shell" },
        ],
      }),
    );
    const fired = tier(m, "copilot-hook").fired ?? "";
    expect(fired).toContain("last activity 2026-02-02T00:00:00Z");
    expect(fired).toContain("failures only");
    // The shared ledger cannot be split per host — the wording says so.
    expect(fired).toContain("not host-attributed");
  });

  test("blocked-by-policy lives ONLY on the VS Code hook tier (unknown when wired, n/a otherwise)", () => {
    const without = buildDeliveryMatrix(baseDeps());
    expect(tier(without, "vscode-hook").blockedByPolicy).toContain("n/a");
    // No other tier carries a policy signal.
    expect(tier(without, "copilot-hook").blockedByPolicy).toBeUndefined();
    expect(tier(without, "claude-hook").blockedByPolicy).toBeUndefined();

    const withHook = buildDeliveryMatrix(
      baseDeps({
        copilotHookStatus: () => ({ present: true, path: "/x", managed: true }),
      }),
    );
    expect(tier(withHook, "vscode-hook").blockedByPolicy).toContain("unknown");
    expect(tier(withHook, "vscode-hook").blockedByPolicy).toContain("not introspectable");
  });
});

describe("host version (reused from preflight)", () => {
  const okCheck: PreflightCheck = {
    name: "Copilot CLI version",
    ok: true,
    detail: "Copilot CLI 1.2.3",
  };

  test("hostVersionFromPreflight returns the version detail when the check is ok", () => {
    expect(hostVersionFromPreflight([okCheck])).toBe("Copilot CLI 1.2.3");
  });

  test('hostVersionFromPreflight returns undefined when the check is "warn" (not found)', () => {
    const warn: PreflightCheck = { name: "Copilot CLI version", ok: "warn", detail: "not found" };
    expect(hostVersionFromPreflight([warn])).toBeUndefined();
  });

  test("matrix prefers the persisted hostVersion, falling back to preflight", () => {
    const persisted = buildDeliveryMatrix(
      baseDeps({ state: { version: 1, hostVersion: "stored 9.9" }, preflight: [okCheck] }),
    );
    expect(persisted.hostVersion).toBe("stored 9.9");
    const live = buildDeliveryMatrix(baseDeps({ preflight: [okCheck] }));
    expect(live.hostVersion).toBe("Copilot CLI 1.2.3");
  });
});

describe("persisted delivery state (read/write)", () => {
  test("write then read round-trips the state", () => {
    writeDeliveryState(
      {
        version: 1,
        installedHost: "vscode",
        installedTiers: ["shim"],
        hostVersion: "v1",
        installedAt: "T0",
        lastVerified: "T0",
      },
      home,
    );
    const read = readDeliveryState(home);
    expect(read.installedHost).toBe("vscode");
    expect(read.installedTiers).toEqual(["shim"]);
    expect(read.hostVersion).toBe("v1");
  });

  test("recordInstall stamps host, tiers, version, and timestamps", () => {
    recordInstall(
      { host: "claude-code", tiers: ["claude-hook", "guidance"], hostVersion: "cc 1" },
      home,
    );
    const read = readDeliveryState(home);
    expect(read.installedHost).toBe("claude-code");
    expect(read.installedTiers).toEqual(["claude-hook", "guidance"]);
    expect(read.hostVersion).toBe("cc 1");
    expect(read.installedAt).toBeTruthy();
    expect(read.lastVerified).toBe(read.installedAt);
  });

  test("updateDeliveryState refreshes lastVerified WITHOUT clobbering install facts", () => {
    recordInstall({ host: "copilot-cli", tiers: ["copilot-hook"], hostVersion: "c 1" }, home);
    const before = readDeliveryState(home);
    updateDeliveryState({ lastVerified: "LATER" }, home);
    const after = readDeliveryState(home);
    expect(after.lastVerified).toBe("LATER");
    // Install-time facts preserved.
    expect(after.installedHost).toBe("copilot-cli");
    expect(after.installedTiers).toEqual(["copilot-hook"]);
    expect(after.hostVersion).toBe("c 1");
    expect(after.installedAt).toBe(before.installedAt);
  });

  test("missing state file → empty default (no throw)", () => {
    const read = readDeliveryState(home);
    expect(read).toEqual({ version: 1 });
    expect(read.installedHost).toBeUndefined();
  });

  test("corrupt state file → empty default (no throw)", () => {
    writeFileSync(deliveryStatePath(home), "{ this is : not json ]");
    const read = readDeliveryState(home);
    expect(read).toEqual({ version: 1 });
  });

  test("non-object JSON (e.g. a bare array) → empty default", () => {
    writeFileSync(deliveryStatePath(home), "[1,2,3]");
    const read = readDeliveryState(home);
    // An array passes JSON.parse but has no install fields — degrades cleanly.
    expect(read.installedHost).toBeUndefined();
    expect(read.installedTiers).toBeUndefined();
  });

  test("a state-write FAILURE is tolerated (never throws)", () => {
    // Point the home at a path whose PARENT is a regular file, so creating the state
    // file is impossible — writeDeliveryState must swallow the error.
    const fileAsDir = join(home, "not-a-dir");
    writeFileSync(fileAsDir, "x");
    const badHome = join(fileAsDir, "inside");
    expect(() =>
      writeDeliveryState({ version: 1, installedHost: "vscode" }, badHome),
    ).not.toThrow();
    // And reading the (never-created) file also degrades to the empty default.
    expect(readDeliveryState(badHome)).toEqual({ version: 1 });
  });

  test("the state file is written owner-only (0600)", () => {
    if (process.platform === "win32") return; // POSIX mode bits only
    const previousUmask = process.umask(0o022);
    try {
      rmSync(home, { recursive: true, force: true });
      writeDeliveryState({ version: 1, installedHost: "vscode" }, home);
      expect(statSync(home).mode & 0o777).toBe(0o700);
      expect(statSync(deliveryStatePath(home)).mode & 0o777).toBe(0o600);
      // chmod a known value first would be circular; assert the file is readable back
      // and that writeDeliveryState did not throw — the 0600 mode is exercised by the
      // initCli smoke. Re-write to confirm idempotent overwrite.
      writeDeliveryState({ version: 1, installedHost: "copilot-cli" }, home);
      expect(readDeliveryState(home).installedHost).toBe("copilot-cli");
      // Tighten then read to prove the path is a normal file we control.
      chmodSync(deliveryStatePath(home), 0o600);
      expect(readFileSync(deliveryStatePath(home), "utf8")).toContain("copilot-cli");
    } finally {
      process.umask(previousUmask);
    }
  });
});

describe("renderDeliveryMatrix + installedTierIds", () => {
  test("render produces one line per tier plus the persisted summary", () => {
    const m = buildDeliveryMatrix(
      baseDeps({
        // A tk-managed copilot hook makes the copilot + VS Code hook tiers "installed",
        // so their per-host `fired` sub-line renders (issue #26).
        copilotHookStatus: () => ({
          present: true,
          path: "/h/.copilot/hooks/tk-rewrite.json",
          managed: true,
        }),
        state: {
          version: 1,
          installedHost: "vscode",
          installedAt: "T0",
          lastVerified: "T1",
          hostVersion: "v9",
        },
      }),
    );
    const lines = renderDeliveryMatrix(m);
    const text = lines.join("\n");
    expect(text).toContain("Delivery matrix:");
    expect(text).toContain("Copilot CLI hook:");
    expect(text).toContain("Claude Code hook:");
    expect(text).toContain("VS Code hook:");
    expect(text).toContain("Shim (PATH):");
    expect(text).toContain("Instruction injection:");
    expect(text).toContain("Usage guidance:");
    // Per-host fired sub-line renders under the installed hook tier(s).
    expect(text).toContain("fired:");
    // VS Code hook tier carries the policy sub-line.
    expect(text).toContain("blocked-by-policy:");
    expect(text).toContain("host version:      v9");
    expect(text).toContain("installed host:    vscode");
    expect(text).toContain("last verified:     T1");
  });

  test("installedTierIds mirrors the per-host install ladder", () => {
    expect(installedTierIds("claude-code")).toEqual(["claude-hook", "guidance"]);
    expect(installedTierIds("copilot-cli")).toEqual(["copilot-hook", "guidance"]);
    expect(installedTierIds("vscode")).toEqual(["shim", "vscode-hook", "guidance"]);
    expect(installedTierIds("unknown")).toEqual(["injection", "guidance"]);
  });
});
