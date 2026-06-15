import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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

  // Issue #20: the file must be conformant to BOTH host protocols. Top-level
  // `version: 1`, plus a camelCase `preToolUse` entry (Copilot CLI native) carrying
  // separate `bash`/`powershell` keys (same resolved command) and `timeoutSec` — so
  // Windows PowerShell tool calls are actually rewritten, not silently skipped.
  test("declares schema version 1", () => {
    expect(buildCopilotHookConfig("CMD").version).toBe(1);
  });

  test("emits a camelCase preToolUse entry with bash + powershell keys", () => {
    const config = buildCopilotHookConfig("CMD");
    expect(config.hooks.preToolUse[0]).toEqual({
      type: "command",
      bash: "CMD",
      powershell: "CMD",
      cwd: ".",
      timeoutSec: 5,
    });
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

  // Issue #20: with no explicit HOME, honor $COPILOT_HOME as the `.copilot` ROOT
  // itself → `$COPILOT_HOME/hooks/<file>` (do NOT append `.copilot`).
  test("user-level honors $COPILOT_HOME as the .copilot root", () => {
    const saved = process.env.COPILOT_HOME;
    const copilotHome = mkdtempSync(join(tmpdir(), "tk-copilot-home-"));
    try {
      process.env.COPILOT_HOME = copilotHome;
      expect(copilotHookConfigPath({ project: false })).toBe(
        join(copilotHome, "hooks", "tk-rewrite.json"),
      );
    } finally {
      if (saved === undefined) delete process.env.COPILOT_HOME;
      else process.env.COPILOT_HOME = saved;
      rmSync(copilotHome, { recursive: true, force: true });
    }
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
