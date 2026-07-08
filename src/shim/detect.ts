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
  // The `copilot` binary resolves on PATH. The AUTHORITATIVE "Copilot CLI is
  // installed" signal — the `~/.copilot` dir can be absent on a fresh install or
  // relocated via COPILOT_HOME, while the binary is what the user actually runs.
  // PATHEXT-aware so a Windows `copilot.cmd` / `copilot.exe` npm shim is found
  // (the very case where a no-shell `spawnSync("copilot")` returns ENOENT but the
  // user's shell resolves `copilot --version` fine).
  copilotOnPath: boolean;
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
  // The binary on PATH is as authoritative as the `~/.copilot` dir (and more
  // reliable on Windows / under COPILOT_HOME) — either proves Copilot CLI is here.
  if (env.copilotDirExists || env.copilotOnPath) return "copilot-cli";
  if (env.claudeSettingsExists) return "claude-code";
  if (env.codeOnPath || env.vscodeUserDirExists) return "vscode";
  return "unknown";
}

// Does `<base>` resolve to an executable on PATH? PATHEXT-aware on Windows so an
// npm-installed `copilot.cmd` / `code.cmd` shim is found — the case a bare
// `spawnSync("copilot")` (no shell) misses, producing the "installed but ctx can't
// see it" symptom. Never throws.
function resolvesOnPath(base: string): boolean {
  try {
    const entries = (process.env.PATH ?? process.env.Path ?? "").split(delimiter).filter(Boolean);
    const exts =
      process.platform === "win32"
        ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter((e) => e.length > 0)
        : [""];
    return entries.some((dir) => exts.some((ext) => existsSync(join(dir, `${base}${ext}`))));
  } catch {
    return false;
  }
}

export function gatherDetectEnv(home = homedir()): DetectEnv {
  return {
    claudeEnv: Boolean(process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT),
    claudeSettingsExists: existsSync(join(home, ".claude", "settings.json")),
    copilotDirExists: existsSync(join(home, ".copilot")),
    copilotOnPath: resolvesOnPath("copilot"),
    termProgram: process.env.TERM_PROGRAM,
    codeOnPath: resolvesOnPath("code"),
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
