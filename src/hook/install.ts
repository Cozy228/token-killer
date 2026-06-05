// Slice 3 — Copilot hook config writer (DESIGN §3.1).
//
// This is NOT an installer command — installation is `tk init`'s job (there is no
// `tk hook install`). This module is the config-writing routine that
// `tk init --host copilot-cli` calls. It writes the host hook config that points
// PreToolUse at `tk hook copilot`; the proxy does the compression.
//
// Scope (DESIGN §15, §3.0): user-level by default — `~/.copilot/hooks/
// tk-rewrite.json`. The repo is written ONLY under `--project`
// (`<cwd>/.github/hooks/tk-rewrite.json`). The file is dedicated and carries a
// marker so uninstall removes only our file, never a user's.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CONFIG_FILENAME = "tk-rewrite.json";

// Marker proving the file is ours (recoverable/marker-based). Sits beside `hooks`;
// the host ignores unknown top-level keys.
const MARKER = "token-killer";

export type CopilotHookConfig = {
  managedBy: string;
  hooks: {
    PreToolUse: Array<{ type: "command"; command: string; cwd: string; timeout: number }>;
  };
};

export type ConfigLocation = { project: boolean; home?: string; cwd?: string };

// The config artifact, format verified from `rtk init --copilot`'s
// `.github/hooks/rtk-rewrite.json` (DESIGN §3.1).
export function buildCopilotHookConfig(): CopilotHookConfig {
  return {
    managedBy: MARKER,
    hooks: {
      PreToolUse: [{ type: "command", command: "tk hook copilot", cwd: ".", timeout: 5 }],
    },
  };
}

export function copilotHookConfigPath(loc: ConfigLocation): string {
  if (loc.project) {
    return join(loc.cwd ?? process.cwd(), ".github", "hooks", CONFIG_FILENAME);
  }
  return join(loc.home ?? homedir(), ".copilot", "hooks", CONFIG_FILENAME);
}

function serialize(config: CopilotHookConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

export type HookConfigPlan = {
  path: string;
  action: "create" | "overwrite" | "unchanged";
  contents: string;
};

// Compute what install WOULD do without writing — backs `tk init --dry-run`.
export function planCopilotHookConfig(loc: ConfigLocation): HookConfigPlan {
  const path = copilotHookConfigPath(loc);
  const contents = serialize(buildCopilotHookConfig());
  if (!existsSync(path)) return { path, action: "create", contents };
  const current = readFileSync(path, "utf8");
  return { path, action: current === contents ? "unchanged" : "overwrite", contents };
}

// Write the config (user-level by default). Idempotent. Returns the plan.
export function installCopilotHookConfig(loc: ConfigLocation): HookConfigPlan {
  const plan = planCopilotHookConfig(loc);
  if (plan.action !== "unchanged") {
    mkdirSync(dirname(plan.path), { recursive: true });
    writeFileSync(plan.path, plan.contents);
  }
  return plan;
}

function isManaged(path: string): boolean {
  if (!existsSync(path)) return false;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { managedBy?: string };
    return parsed.managedBy === MARKER;
  } catch {
    return false;
  }
}

// Remove our config — only if the marker proves we wrote it (never clobber a
// user's own hooks file).
export function uninstallCopilotHookConfig(loc: ConfigLocation): { path: string; removed: boolean } {
  const path = copilotHookConfigPath(loc);
  if (!isManaged(path)) return { path, removed: false };
  rmSync(path, { force: true });
  return { path, removed: true };
}

export function copilotHookConfigStatus(loc: ConfigLocation): {
  path: string;
  present: boolean;
  managed: boolean;
} {
  const path = copilotHookConfigPath(loc);
  return { path, present: existsSync(path), managed: isManaged(path) };
}
