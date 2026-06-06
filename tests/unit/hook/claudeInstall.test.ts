import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  claudeHookStatus,
  claudeSettingsPath,
  installClaudeHook,
  patchClaudeSettings,
  planClaudeHookInstall,
  uninstallClaudeHook,
} from "../../../src/hook/claudeInstall.js";

// A fixed absolute-form tk command so tests don't depend on process.argv[1].
const TK_CMD = "/usr/bin/node /opt/tk/dist/cli.js hook claude";

let home: string;
function settings() {
  return claudeSettingsPath({ home });
}
function writeSettings(obj: unknown) {
  mkdirSync(join(home, ".claude"), { recursive: true });
  writeFileSync(settings(), `${JSON.stringify(obj, null, 2)}\n`);
}
function readSettings() {
  return JSON.parse(readFileSync(settings(), "utf8"));
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "tk-claude-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("patchClaudeSettings — pure patcher", () => {
  test("empty settings → appends a Bash PreToolUse group", () => {
    const { settings, action } = patchClaudeSettings({}, TK_CMD);
    expect(action).toBe("append");
    expect(settings.hooks?.PreToolUse).toEqual([
      { matcher: "Bash", hooks: [{ type: "command", command: TK_CMD }] },
    ]);
  });

  test("replaces an existing `rtk hook claude` entry in place (drop-in)", () => {
    const base = {
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "rtk hook claude" }] }],
      },
    };
    const { settings, action } = patchClaudeSettings(base, TK_CMD);
    expect(action).toBe("replace");
    expect(settings.hooks?.PreToolUse?.[0]?.hooks?.[0]?.command).toBe(TK_CMD);
    // exactly one group — no duplicate appended
    expect(settings.hooks?.PreToolUse).toHaveLength(1);
  });

  test("idempotent — already pointing at our command → unchanged", () => {
    const base = patchClaudeSettings({}, TK_CMD).settings;
    const { action } = patchClaudeSettings(base, TK_CMD);
    expect(action).toBe("unchanged");
  });

  test("does not mutate the caller's object", () => {
    const base = {
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "rtk hook claude" }] }],
      },
    };
    patchClaudeSettings(base, TK_CMD);
    expect(base.hooks.PreToolUse[0].hooks[0].command).toBe("rtk hook claude");
  });

  test("preserves unrelated keys and non-Bash hooks", () => {
    const base = {
      statusLine: { type: "command", command: "sh status.sh" },
      enabledPlugins: { "codex@openai-codex": true },
      env: { FOO: "bar" },
      hooks: {
        PreToolUse: [
          { matcher: "Read", hooks: [{ type: "command", command: "other hook" }] },
          { matcher: "Bash", hooks: [{ type: "command", command: "rtk hook claude" }] },
        ],
      },
    };
    const { settings } = patchClaudeSettings(base, TK_CMD);
    expect(settings.statusLine).toEqual(base.statusLine);
    expect(settings.enabledPlugins).toEqual(base.enabledPlugins);
    expect(settings.env).toEqual(base.env);
    // the non-Bash group is untouched; the Bash group is retargeted
    expect(settings.hooks?.PreToolUse?.[0]).toEqual(base.hooks.PreToolUse[0]);
    expect(settings.hooks?.PreToolUse?.[1]?.hooks?.[0]?.command).toBe(TK_CMD);
  });
});

describe("installClaudeHook — against a temp settings.json", () => {
  test("fresh install creates the file with a Bash PreToolUse hook", () => {
    const plan = installClaudeHook({ home }, TK_CMD);
    expect(plan.action).toBe("create");
    expect(readSettings().hooks.PreToolUse[0].hooks[0].command).toBe(TK_CMD);
  });

  test("idempotent re-install → unchanged, no rewrite", () => {
    installClaudeHook({ home }, TK_CMD);
    expect(installClaudeHook({ home }, TK_CMD).action).toBe("unchanged");
  });

  test("replaces rtk entry in place and preserves other keys byte-equivalent", () => {
    writeSettings({
      env: {},
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "rtk hook claude" }] }],
      },
      statusLine: { type: "command", command: "sh /x/statusline.sh" },
      enabledPlugins: { "codex@openai-codex": true },
    });
    const plan = installClaudeHook({ home }, TK_CMD);
    expect(plan.action).toBe("replace");
    expect(plan.previousCommand).toBe("rtk hook claude");
    const after = readSettings();
    expect(after.hooks.PreToolUse[0].hooks[0].command).toBe(TK_CMD);
    expect(after.statusLine).toEqual({ type: "command", command: "sh /x/statusline.sh" });
    expect(after.enabledPlugins).toEqual({ "codex@openai-codex": true });
    expect(after.env).toEqual({});
  });

  test("plan (dry-run) does not write", () => {
    const plan = planClaudeHookInstall({ home }, TK_CMD);
    expect(plan.action).toBe("create");
    expect(existsSync(plan.path)).toBe(false);
  });
});

describe("uninstallClaudeHook", () => {
  test("removes only tk's entry and drops the emptied Bash group", () => {
    installClaudeHook({ home }, TK_CMD);
    const r = uninstallClaudeHook({ home }, TK_CMD);
    expect(r.removed).toBe(true);
    expect(readSettings().hooks.PreToolUse).toEqual([]);
  });

  test("leaves other keys and co-resident hooks intact", () => {
    writeSettings({
      statusLine: { type: "command", command: "sh s.sh" },
      hooks: {
        PreToolUse: [
          { matcher: "Read", hooks: [{ type: "command", command: "keep me" }] },
          { matcher: "Bash", hooks: [{ type: "command", command: TK_CMD }] },
        ],
      },
    });
    const r = uninstallClaudeHook({ home }, TK_CMD);
    expect(r.removed).toBe(true);
    const after = readSettings();
    expect(after.statusLine).toEqual({ type: "command", command: "sh s.sh" });
    expect(after.hooks.PreToolUse).toEqual([
      { matcher: "Read", hooks: [{ type: "command", command: "keep me" }] },
    ]);
  });

  test("refuses to remove a foreign `rtk hook claude` entry", () => {
    writeSettings({
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "rtk hook claude" }] }],
      },
    });
    const r = uninstallClaudeHook({ home }, TK_CMD);
    expect(r.removed).toBe(false);
    expect(readSettings().hooks.PreToolUse[0].hooks[0].command).toBe("rtk hook claude");
  });

  test("removes a legacy bare `tk hook claude` entry", () => {
    writeSettings({
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "tk hook claude" }] }],
      },
    });
    const r = uninstallClaudeHook({ home }, TK_CMD);
    expect(r.removed).toBe(true);
  });

  test("missing file → nothing to remove (no throw)", () => {
    expect(uninstallClaudeHook({ home }, TK_CMD).removed).toBe(false);
  });
});

describe("claudeHookStatus", () => {
  test("absent → not present", () => {
    expect(claudeHookStatus({ home }, TK_CMD).present).toBe(false);
  });

  test("present + points at tk after install", () => {
    installClaudeHook({ home }, TK_CMD);
    const s = claudeHookStatus({ home }, TK_CMD);
    expect(s.present).toBe(true);
    expect(s.pointsAtTk).toBe(true);
  });

  test("present but NOT tk when only rtk is wired", () => {
    writeSettings({
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "rtk hook claude" }] }],
      },
    });
    const s = claudeHookStatus({ home }, TK_CMD);
    expect(s.present).toBe(true);
    expect(s.pointsAtTk).toBe(false);
  });
});
