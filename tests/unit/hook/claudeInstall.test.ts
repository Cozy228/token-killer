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

// A fixed absolute-form ctx command so tests don't depend on process.argv[1].
const CTX_CMD = "/usr/bin/node /opt/ctx/dist/cli.js hook claude";

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
  home = mkdtempSync(join(tmpdir(), "ctx-claude-"));
});
afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe("patchClaudeSettings — pure patcher", () => {
  test("empty settings → appends a Bash PreToolUse group", () => {
    const { settings, action } = patchClaudeSettings({}, CTX_CMD);
    expect(action).toBe("append");
    expect(settings.hooks?.PreToolUse).toEqual([
      { matcher: "Bash", hooks: [{ type: "command", command: CTX_CMD }] },
    ]);
  });

  test("replaces an existing `rtk hook claude` entry in place (drop-in)", () => {
    const base = {
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "rtk hook claude" }] }],
      },
    };
    const { settings, action } = patchClaudeSettings(base, CTX_CMD);
    expect(action).toBe("replace");
    expect(settings.hooks?.PreToolUse?.[0]?.hooks?.[0]?.command).toBe(CTX_CMD);
    // exactly one group — no duplicate appended
    expect(settings.hooks?.PreToolUse).toHaveLength(1);
  });

  test("idempotent — already pointing at our command → unchanged", () => {
    const base = patchClaudeSettings({}, CTX_CMD).settings;
    const { action } = patchClaudeSettings(base, CTX_CMD);
    expect(action).toBe("unchanged");
  });

  test("does not mutate the caller's object", () => {
    const base = {
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "rtk hook claude" }] }],
      },
    };
    patchClaudeSettings(base, CTX_CMD);
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
    const { settings } = patchClaudeSettings(base, CTX_CMD);
    expect(settings.statusLine).toEqual(base.statusLine);
    expect(settings.enabledPlugins).toEqual(base.enabledPlugins);
    expect(settings.env).toEqual(base.env);
    // the non-Bash group is untouched; the Bash group is retargeted
    expect(settings.hooks?.PreToolUse?.[0]).toEqual(base.hooks.PreToolUse[0]);
    expect(settings.hooks?.PreToolUse?.[1]?.hooks?.[0]?.command).toBe(CTX_CMD);
  });
});

describe("installClaudeHook — against a temp settings.json", () => {
  test("fresh install creates the file with a Bash PreToolUse hook", () => {
    const plan = installClaudeHook({ home }, CTX_CMD);
    expect(plan.action).toBe("create");
    expect(readSettings().hooks.PreToolUse[0].hooks[0].command).toBe(CTX_CMD);
  });

  test("idempotent re-install → unchanged, no rewrite", () => {
    installClaudeHook({ home }, CTX_CMD);
    expect(installClaudeHook({ home }, CTX_CMD).action).toBe("unchanged");
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
    const plan = installClaudeHook({ home }, CTX_CMD);
    expect(plan.action).toBe("replace");
    expect(plan.previousCommand).toBe("rtk hook claude");
    const after = readSettings();
    expect(after.hooks.PreToolUse[0].hooks[0].command).toBe(CTX_CMD);
    expect(after.statusLine).toEqual({ type: "command", command: "sh /x/statusline.sh" });
    expect(after.enabledPlugins).toEqual({ "codex@openai-codex": true });
    expect(after.env).toEqual({});
  });

  test("plan (dry-run) does not write", () => {
    const plan = planClaudeHookInstall({ home }, CTX_CMD);
    expect(plan.action).toBe("create");
    expect(existsSync(plan.path)).toBe(false);
  });
});

describe("uninstallClaudeHook", () => {
  test("removes only ctx's entry and drops the emptied Bash group", () => {
    installClaudeHook({ home }, CTX_CMD);
    const r = uninstallClaudeHook({ home }, CTX_CMD);
    expect(r.removed).toBe(true);
    expect(readSettings().hooks.PreToolUse).toEqual([]);
  });

  test("leaves other keys and co-resident hooks intact", () => {
    writeSettings({
      statusLine: { type: "command", command: "sh s.sh" },
      hooks: {
        PreToolUse: [
          { matcher: "Read", hooks: [{ type: "command", command: "keep me" }] },
          { matcher: "Bash", hooks: [{ type: "command", command: CTX_CMD }] },
        ],
      },
    });
    const r = uninstallClaudeHook({ home }, CTX_CMD);
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
    const r = uninstallClaudeHook({ home }, CTX_CMD);
    expect(r.removed).toBe(false);
    expect(readSettings().hooks.PreToolUse[0].hooks[0].command).toBe("rtk hook claude");
  });

  test("removes a legacy bare `ctx hook claude` entry", () => {
    writeSettings({
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "ctx hook claude" }] }],
      },
    });
    const r = uninstallClaudeHook({ home }, CTX_CMD);
    expect(r.removed).toBe(true);
  });

  test("missing file → nothing to remove (no throw)", () => {
    expect(uninstallClaudeHook({ home }, CTX_CMD).removed).toBe(false);
  });
});

describe("claudeHookStatus", () => {
  test("absent → not present", () => {
    expect(claudeHookStatus({ home }, CTX_CMD).present).toBe(false);
  });

  test("present + points at ctx after install", () => {
    installClaudeHook({ home }, CTX_CMD);
    const s = claudeHookStatus({ home }, CTX_CMD);
    expect(s.present).toBe(true);
    expect(s.pointsAtTk).toBe(true);
  });

  test("present but NOT ctx when only rtk is wired", () => {
    writeSettings({
      hooks: {
        PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "rtk hook claude" }] }],
      },
    });
    const s = claudeHookStatus({ home }, CTX_CMD);
    expect(s.present).toBe(true);
    expect(s.pointsAtTk).toBe(false);
  });

  // Regression: a hook installed by the GLOBAL ctx binary (`node /abs/bin/ctx hook
  // claude`) must read as pointsAtTk EVEN WHEN the status probe runs from a
  // different ctx (a dev checkout, or after an nvm node upgrade), where the exact
  // command no longer matches. The `ctx` binary sits behind a `/` separator, which
  // the old whitespace-only boundary missed → a healthy install reported "NOT ctx".
  test("points at ctx for an absolute global-binary hook under a different ourCommand", () => {
    writeSettings({
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command:
                  "/home/u/.nvm/versions/node/v22/bin/node /home/u/.nvm/versions/node/v22/bin/ctx hook claude",
              },
            ],
          },
        ],
      },
    });
    // ourCommand intentionally differs (different node + dev cli path).
    const s = claudeHookStatus({ home }, "/usr/bin/node /repo/src/cli.ts hook claude");
    expect(s.present).toBe(true);
    expect(s.pointsAtTk).toBe(true);
  });

  test("points at ctx for a quoted Windows ctx.cmd hook", () => {
    writeSettings({
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [
              {
                type: "command",
                command: '"C:\\Users\\x\\AppData\\Roaming\\npm\\ctx.cmd" hook claude',
              },
            ],
          },
        ],
      },
    });
    const s = claudeHookStatus({ home }, CTX_CMD);
    expect(s.pointsAtTk).toBe(true);
  });

  // The broadened boundary must still reject a foreign `rtk` at an absolute path.
  test("NOT ctx for an absolute-path foreign rtk hook", () => {
    writeSettings({
      hooks: {
        PreToolUse: [
          {
            matcher: "Bash",
            hooks: [{ type: "command", command: "/opt/rtk/bin/rtk hook claude" }],
          },
        ],
      },
    });
    const s = claudeHookStatus({ home }, CTX_CMD);
    expect(s.present).toBe(true);
    expect(s.pointsAtTk).toBe(false);
  });
});
