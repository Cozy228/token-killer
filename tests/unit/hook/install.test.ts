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
  home = mkdtempSync(join(tmpdir(), "tg-hookcfg-home-"));
  cwd = mkdtempSync(join(tmpdir(), "tg-hookcfg-proj-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
  rmSync(cwd, { recursive: true, force: true });
});

describe("config artifact (DESIGN §3.1)", () => {
  test("matches the rtk-verified shape and points at tg hook copilot", () => {
    const config = buildCopilotHookConfig();
    expect(config.hooks.PreToolUse).toEqual([
      { type: "command", command: "tg hook copilot", cwd: ".", timeout: 5 },
    ]);
    expect(config.managedBy).toBe("token-guard");
  });
});

describe("paths — user-level default, repo only under --project", () => {
  test("user-level → ~/.copilot/hooks/tg-rewrite.json", () => {
    expect(copilotHookConfigPath({ project: false, home })).toBe(
      join(home, ".copilot", "hooks", "tg-rewrite.json"),
    );
  });

  test("project → <cwd>/.github/hooks/tg-rewrite.json", () => {
    expect(copilotHookConfigPath({ project: true, cwd })).toBe(
      join(cwd, ".github", "hooks", "tg-rewrite.json"),
    );
  });
});

describe("install / plan / uninstall", () => {
  test("install writes the user-level config", () => {
    const plan = installCopilotHookConfig({ project: false, home });
    expect(plan.action).toBe("create");
    const written = JSON.parse(readFileSync(plan.path, "utf8"));
    expect(written.hooks.PreToolUse[0].command).toBe("tg hook copilot");
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

  test("uninstall refuses to delete a non-tg hooks file (no marker)", () => {
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
