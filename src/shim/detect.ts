import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

import { vscodeUserDir } from "./hostConfig.js";

// Host + tier auto-detection (goal Phase 3 step 2, ADR 0002 §1). The ladder is
// Hook > Shim > Instruction injection; a host uses the highest tier it supports.

export type Host = "claude-code" | "copilot-cli" | "vscode" | "unknown";
export type Tier = "hook" | "shim" | "injection";

export type DetectEnv = {
  // Claude Code sets these only while a tool is actually running inside it — an
  // unambiguous live-host signal.
  claudeEnv: boolean;
  // A weaker, persistent signal: the user has a Claude Code settings file.
  claudeSettingsExists: boolean;
  copilotDirExists: boolean;
  termProgram?: string;
  codeOnPath: boolean;
  vscodeUserDirExists: boolean;
};

// Pure host detection from observable signals. A live Claude Code session
// (env markers) wins outright. Otherwise Copilot CLI when its dir exists, then a
// persistent Claude Code config, then VS Code, then unknown.
export function detectHost(env: DetectEnv): Host {
  if (env.claudeEnv) return "claude-code";
  if (env.copilotDirExists) return "copilot-cli";
  if (env.claudeSettingsExists) return "claude-code";
  if (env.termProgram === "vscode" || env.codeOnPath || env.vscodeUserDirExists) return "vscode";
  return "unknown";
}

function codeResolvesOnPath(): boolean {
  const entries = (process.env.PATH ?? "").split(delimiter).filter(Boolean);
  const names = process.platform === "win32" ? ["code.cmd", "code.exe", "code"] : ["code"];
  return entries.some((dir) => names.some((n) => existsSync(join(dir, n))));
}

export function gatherDetectEnv(home = homedir()): DetectEnv {
  return {
    claudeEnv: Boolean(process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT),
    claudeSettingsExists: existsSync(join(home, ".claude", "settings.json")),
    copilotDirExists: existsSync(join(home, ".copilot")),
    termProgram: process.env.TERM_PROGRAM,
    codeOnPath: codeResolvesOnPath(),
    vscodeUserDirExists: existsSync(vscodeUserDir(process.platform, home)),
  };
}

// The final tier given the detected host, whether a hook installer (Track B)
// exists, and the live shim interception probe. Copilot CLI prefers the hook
// seam; if it is not built, it (like VS Code) uses the shim when the probe
// passes, else falls to injection. Unknown hosts always get injection.
export function selectTier(host: Host, hookAvailable: boolean, shimProbePass: boolean): Tier {
  if ((host === "copilot-cli" || host === "claude-code") && hookAvailable) return "hook";
  if ((host === "copilot-cli" || host === "vscode") && shimProbePass) return "shim";
  return "injection";
}
