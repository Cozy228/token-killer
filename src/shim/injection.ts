import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { tokenGuardHome } from "../core/dataDir.js";
import type { Host } from "./detect.js";

// Instruction injection — the LOWEST delivery tier (CONTEXT.md → Instruction
// injection). A guarded, idempotent Markdown block telling the model to prefix
// commands with `tg`. Coverage is probabilistic, so this is the fallback when
// neither hook nor shim is available (or the shim probe failed).

const START = "<!-- >>> token-guard >>> -->";
const END = "<!-- <<< token-guard <<< -->";
const BLOCK_RE = /\n?<!-- >>> token-guard >>> -->[\s\S]*?<!-- <<< token-guard <<< -->\n?/;

export function injectionBody(): string {
  return [
    "## Token Guard",
    "",
    "Prefix shell commands with `tg` to cut token usage on their output, e.g.",
    "`tg git status`, `tg npm test`, `tg grep TODO src`. Token Guard runs the real",
    "tool and compresses its output losslessly; interactive commands and unknown",
    "tools pass through unchanged.",
  ].join("\n");
}

export function injectionBlock(body = injectionBody()): string {
  return `${START}\n${body}\n${END}`;
}

export function removeInjectionBlock(content: string): string {
  return content.replace(BLOCK_RE, "");
}

// Idempotent: strip any existing block, append a fresh one.
export function applyInjectionBlock(content: string, body = injectionBody()): string {
  const stripped = removeInjectionBlock(content);
  const base = stripped === "" ? "" : `${stripped.replace(/\n*$/, "")}\n\n`;
  return `${base}${injectionBlock(body)}\n`;
}

export function writeInjection(filePath: string, body = injectionBody()): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const content = existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
  writeFileSync(filePath, applyInjectionBlock(content, body));
}

export function unwriteInjection(filePath: string): void {
  if (!existsSync(filePath)) return;
  writeFileSync(filePath, removeInjectionBlock(readFileSync(filePath, "utf8")));
}

// User-level instruction file for a host (the DEFAULT target — never the repo).
// Copilot CLI → ~/.copilot/; VS Code → the VS Code user dir; unknown → a
// ~/.token-guard/ file the caller surfaces with a printed note.
export function userInjectionPath(
  host: Host,
  home = homedir(),
  vscodeUserDirPath?: string,
): string {
  if (host === "copilot-cli") return join(home, ".copilot", "copilot-instructions.md");
  if (host === "vscode" && vscodeUserDirPath) return join(vscodeUserDirPath, "copilot-instructions.md");
  return join(tokenGuardHome(), "copilot-instructions.md");
}

// Project-level target — the ONLY project-repo write, gated behind `tg init
// --project`.
export function projectInjectionPath(cwd: string): string {
  return join(cwd, ".github", "copilot-instructions.md");
}
