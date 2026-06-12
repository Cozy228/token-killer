import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  chmodSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildCopilotHookConfig,
  copilotHookConfigPath,
  copilotHookConfigStatus,
  installCopilotHookConfig,
  planCopilotHookConfig,
  uninstallCopilotHookConfig,
} from "../../../src/hook/install.js";

let home: string;
let cwd: string;

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-hookcfg-home-"));
  cwd = mkdtempSync(join(tmpdir(), "tk-hookcfg-proj-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("config artifact (DESIGN §3.1)", () => {
  test("matches the rtk-verified shape with a fixed command", () => {
    const config = buildCopilotHookConfig("tk hook copilot");
    expect(config.hooks.PreToolUse).toEqual([
      { type: "command", command: "tk hook copilot", cwd: ".", timeout: 5 },
    ]);
    expect(config.managedBy).toBe("token-killer");
  });

  // Audit #13 / ADR 0005 §5: the default command resolves an ABSOLUTE node + cli
  // path (a bare `tk` is inert on Windows PowerShell), still ending in `hook copilot`.
  test("default command resolves absolute node + cli, not a bare `tk`", () => {
    const command = buildCopilotHookConfig().hooks.PreToolUse[0]!.command;
    expect(command.endsWith("hook copilot")).toBe(true);
    expect(command.startsWith("tk ")).toBe(false);
    expect(command).toContain(process.execPath);
  });
});

describe("paths — user-level default, repo only under --project", () => {
  test("user-level → ~/.copilot/hooks/tk-rewrite.json", () => {
    expect(copilotHookConfigPath({ project: false, home })).toBe(
      join(home, ".copilot", "hooks", "tk-rewrite.json"),
    );
  });

  test("project → <cwd>/.github/hooks/tk-rewrite.json", () => {
    expect(copilotHookConfigPath({ project: true, cwd })).toBe(
      join(cwd, ".github", "hooks", "tk-rewrite.json"),
    );
  });
});

describe("install / plan / uninstall", () => {
  test("install writes the user-level config", () => {
    const plan = installCopilotHookConfig({ project: false, home });
    expect(plan.action).toBe("create");
    const written = JSON.parse(readFileSync(plan.path, "utf8"));
    expect(written.hooks.PreToolUse[0].command.endsWith("hook copilot")).toBe(true);
  });

  test("install is idempotent (second run → unchanged)", () => {
    installCopilotHookConfig({ project: false, home });
    expect(installCopilotHookConfig({ project: false, home }).action).toBe("unchanged");
  });

  test("plan does not write (dry-run backing)", () => {
    const plan = planCopilotHookConfig({ project: false, home });
    expect(plan.action).toBe("create");
    expect(existsSync(plan.path)).toBe(false);
  });

  test("uninstall removes only our marker-bearing file", () => {
    installCopilotHookConfig({ project: false, home });
    const removed = uninstallCopilotHookConfig({ project: false, home });
    expect(removed.removed).toBe(true);
    expect(existsSync(removed.path)).toBe(false);
  });

  test("uninstall refuses to delete a non-tk hooks file (no marker)", () => {
    const path = copilotHookConfigPath({ project: false, home });
    mkdirSync(join(home, ".copilot", "hooks"), { recursive: true });
    writeFileSync(path, JSON.stringify({ hooks: { PreToolUse: [] } }));
    const removed = uninstallCopilotHookConfig({ project: false, home });
    expect(removed.removed).toBe(false);
    expect(existsSync(path)).toBe(true);
  });

  test("status reports presence and managed marker", () => {
    expect(copilotHookConfigStatus({ project: false, home }).present).toBe(false);
    installCopilotHookConfig({ project: false, home });
    const s = copilotHookConfigStatus({ project: false, home });
    expect(s.present).toBe(true);
    expect(s.managed).toBe(true);
  });
});

// Install must apply the same marker discipline uninstall already does: never
// clobber a file we don't own (Plan 008). Marker-bearing files keep the upgrade
// overwrite (contents embed absolute node+cli paths and legitimately change).
describe("install refuses to overwrite an unmanaged config (Plan 008)", () => {
  function configDir(): string {
    return join(home, ".copilot", "hooks");
  }

  test("unmanaged file with differing contents → skipped-unmanaged, bytes untouched", () => {
    const path = copilotHookConfigPath({ project: false, home });
    mkdirSync(configDir(), { recursive: true });
    const userBytes = JSON.stringify({ hooks: { PreToolUse: [{ timeout: 99 }] } });
    writeFileSync(path, userBytes);

    const plan = installCopilotHookConfig({ project: false, home });
    expect(plan.action).toBe("skipped-unmanaged");
    expect(readFileSync(path, "utf8")).toBe(userBytes);
  });

  test("managed file with differing contents → overwrite (upgrade path)", () => {
    const path = copilotHookConfigPath({ project: false, home });
    mkdirSync(configDir(), { recursive: true });
    // Ours (carries the marker) but a stale command — the upgrade case.
    const stale = JSON.stringify({
      managedBy: "token-killer",
      hooks: { PreToolUse: [{ type: "command", command: "old", cwd: ".", timeout: 5 }] },
    });
    writeFileSync(path, stale);

    const plan = installCopilotHookConfig({ project: false, home });
    expect(plan.action).toBe("overwrite");
    expect(readFileSync(path, "utf8")).toBe(plan.contents);
    expect(readFileSync(path, "utf8")).not.toBe(stale);
  });

  test("unparseable existing file → skipped-unmanaged, untouched", () => {
    const path = copilotHookConfigPath({ project: false, home });
    mkdirSync(configDir(), { recursive: true });
    const garbage = "{ not json";
    writeFileSync(path, garbage);

    const plan = installCopilotHookConfig({ project: false, home });
    expect(plan.action).toBe("skipped-unmanaged");
    expect(readFileSync(path, "utf8")).toBe(garbage);
  });

  test("no file → create (unchanged behavior)", () => {
    const plan = installCopilotHookConfig({ project: false, home });
    expect(plan.action).toBe("create");
    expect(existsSync(plan.path)).toBe(true);
  });

  test("identical file → unchanged (unchanged behavior)", () => {
    installCopilotHookConfig({ project: false, home });
    const plan = installCopilotHookConfig({ project: false, home });
    expect(plan.action).toBe("unchanged");
  });
});

// Issue #11: the unmanaged-guard plus an in-place truncating write could turn tk's
// OWN interrupted write into an unparseable file the guard then refuses to repair.
// The write must be atomic (same-dir temp + rename) and revalidate ownership right
// before replacing an existing file.
describe("atomic write + pre-replace revalidation (issue #11)", () => {
  function configDir(): string {
    return join(home, ".copilot", "hooks");
  }

  test("a failed install attempt never leaves the managed file torn/zero-byte", () => {
    // Seed a valid managed file (the upgrade target).
    installCopilotHookConfig({ project: false, home });
    const path = copilotHookConfigPath({ project: false, home });
    // Make it stale so the next install plans an overwrite (would O_TRUNC in place
    // under the old code).
    const stale = JSON.stringify({
      managedBy: "token-killer",
      hooks: { PreToolUse: [{ type: "command", command: "old", cwd: ".", timeout: 5 }] },
    });
    writeFileSync(path, stale);

    // Force the rename to fail by making the parent directory read-only, modelling a
    // crash/permission failure during the swap.
    const dir = configDir();
    chmodSync(dir, 0o500);
    let threw = false;
    try {
      installCopilotHookConfig({ project: false, home });
    } catch {
      threw = true;
    } finally {
      chmodSync(dir, 0o700);
    }
    expect(threw).toBe(true);

    // The pre-existing managed file is intact (not zero-byte, still parseable, still
    // exactly the stale bytes) — atomicity guarantees the destination is untouched on
    // a failed swap. And no temp file is left stranded.
    expect(readFileSync(path, "utf8")).toBe(stale);
    expect(JSON.parse(readFileSync(path, "utf8")).managedBy).toBe("token-killer");
    const leftover = readdirSync(dir).filter((f) => f.includes(".tmp"));
    expect(leftover).toEqual([]);
  });

  test("a file that becomes unmanaged between plan and write is not clobbered", () => {
    mkdirSync(configDir(), { recursive: true });
    const path = copilotHookConfigPath({ project: false, home });

    // Model the TOCTOU race directly: planning happened when the file was MANAGED and
    // stale, yielding an `overwrite` plan. Before the write lands, a concurrent process
    // replaced the file with the user's OWN unmanaged config. We replay that exact
    // `overwrite` plan against the now-unmanaged on-disk file via the test seam. The
    // pre-rename revalidation must catch the flip and abort to `skipped-unmanaged`,
    // leaving the user's bytes (and no temp file) behind.
    const overwritePlan = planCopilotHookConfig({ project: false, home });
    expect(overwritePlan.action).toBe("create"); // nothing on disk yet
    const staleManagedPlan = { ...overwritePlan, action: "overwrite" as const };

    const userBytes = JSON.stringify({ hooks: { PreToolUse: [{ timeout: 99 }] } });
    writeFileSync(path, userBytes); // the file is now unmanaged

    const plan = installCopilotHookConfig({ project: false, home }, staleManagedPlan);
    expect(plan.action).toBe("skipped-unmanaged");
    // The user's file is byte-for-byte untouched, and no temp file leaked.
    expect(readFileSync(path, "utf8")).toBe(userBytes);
    const leftover = readdirSync(configDir()).filter((f) => f.includes(".tmp"));
    expect(leftover).toEqual([]);
  });
});
