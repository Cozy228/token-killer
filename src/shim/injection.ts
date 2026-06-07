import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { tokenKillerHome } from "../core/dataDir.js";
import type { Host } from "./detect.js";

// Instruction injection — the LOWEST delivery tier (CONTEXT.md → Instruction
// injection). A guarded, idempotent Markdown block telling the model to prefix
// commands with `tk`. Coverage is probabilistic, so this is the fallback when
// neither hook nor shim is available (or the shim probe failed).

const START = "<!-- >>> token-killer >>> -->";
const END = "<!-- <<< token-killer <<< -->";
const BLOCK_RE = /\n?<!-- >>> token-killer >>> -->[\s\S]*?<!-- <<< token-killer <<< -->\n?/;

export function injectionBody(): string {
  return [
    "## Token Killer",
    "",
    "Prefix shell commands with `tk` to cut token usage on their output, e.g.",
    "`tk git status`, `tk npm test`, `tk grep TODO src`. Token Killer runs the real",
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
  const stripped = removeInjectionBlock(readFileSync(filePath, "utf8"));
  // If only tk's block was in the file, tk created it solely for that block —
  // delete it rather than leave a 0-byte file (e.g. a project `.github/
  // copilot-instructions.md`). A file that still has the user's own content keeps
  // it; only the block is stripped.
  if (stripped.trim() === "") {
    rmSync(filePath, { force: true });
    return;
  }
  writeFileSync(filePath, stripped);
}

// User-level instruction file for a host (the DEFAULT target — never the repo).
// Copilot CLI → ~/.copilot/; VS Code → the VS Code user dir; unknown → a
// ~/.token-killer/ file the caller surfaces with a printed note.
export function userInjectionPath(
  host: Host,
  home = homedir(),
  vscodeUserDirPath?: string,
): string {
  if (host === "copilot-cli") return join(home, ".copilot", "copilot-instructions.md");
  if (host === "vscode" && vscodeUserDirPath)
    return join(vscodeUserDirPath, "copilot-instructions.md");
  return join(tokenKillerHome(), "copilot-instructions.md");
}

// Project-level target — the ONLY project-repo write, gated behind `tk init
// --project`.
export function projectInjectionPath(cwd: string): string {
  return join(cwd, ".github", "copilot-instructions.md");
}
