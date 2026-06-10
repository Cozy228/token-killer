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

// Pure host detection from observable signals. Live-session markers win first —
// a live Claude Code session (CLAUDECODE env) or VS Code's integrated terminal
// (TERM_PROGRAM=vscode) — because they prove the host you are running INSIDE right
// now, which beats weaker persistent config that only shows a host is installed.
// Then persistent config, strongest first: Copilot CLI's `~/.copilot` dir (which
// can linger even for a pure-VS-Code user, so it must not outrank a live VS Code
// terminal), a Claude Code settings file, an installed VS Code, then unknown.
export function detectHost(env: DetectEnv): Host {
  if (env.claudeEnv) return "claude-code";
  if (env.termProgram === "vscode") return "vscode";
  if (env.copilotDirExists) return "copilot-cli";
  if (env.claudeSettingsExists) return "claude-code";
  if (env.codeOnPath || env.vscodeUserDirExists) return "vscode";
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

// The final tier given a host's supported tiers (best-first, from its
// HostAdapter), whether a hook installer (Track B) exists, and the live shim
// interception probe. Reads `supportedTiers` rather than hardcoding host names so
// it stays the single source of truth: a new host that lists "hook"/"shim" gets
// that tier with no edit here. A host prefers the hook seam when it supports one
// and a hook installer exists; else the shim when it supports one and the probe
// passes; else injection.
export function selectTier(
  supportedTiers: Tier[],
  hookAvailable: boolean,
  shimProbePass: boolean,
): Tier {
  if (supportedTiers.includes("hook") && hookAvailable) return "hook";
  if (supportedTiers.includes("shim") && shimProbePass) return "shim";
  return "injection";
}
