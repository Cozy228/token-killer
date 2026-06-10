import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { writeFileAtomicSync } from "../core/atomicWrite.js";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

// Host PATH injection (ADR 0002 §5, goal Phase 2 step 4). Two surfaces:
//  - shell RC (~/.zshrc, ~/.bashrc): a guarded, idempotent, byte-identically
//    removable block. For Copilot CLI and plain terminals.
//  - VS Code user settings.json: terminal.integrated.env.{osx,linux,windows}
//    PATH prepend + TK_SHIM_DIR. Non-interactive run_in_terminal shells skip RC,
//    so VS Code MUST use terminal.integrated.env (lesson from the hook round).

// ---------------------------------------------------------------------------
// Shell RC block
// ---------------------------------------------------------------------------

const RC_START = "# >>> token-killer shim >>>";
const RC_END = "# <<< token-killer shim <<<";
// Matches the block plus the single bordering newlines patchRc writes, so
// unpatch is byte-identical to the pre-patch state.
const RC_BLOCK_RE = /\n?# >>> token-killer shim >>>[\s\S]*?# <<< token-killer shim <<<\n?/;

function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function rcBlock(shimDir: string): string {
  return [
    RC_START,
    `export TK_SHIM_DIR=${shQuote(shimDir)}`,
    `export PATH="$TK_SHIM_DIR:$PATH"`,
    RC_END,
  ].join("\n");
}

export function removeRcBlock(content: string): string {
  return content.replace(RC_BLOCK_RE, "");
}

// Pure transform: strip any existing block, then append a fresh one. Idempotent
// (run twice → one block) and prepends the shim dir at shell init.
export function applyRcBlock(content: string, shimDir: string): string {
  const stripped = removeRcBlock(content);
  return `${stripped}\n${rcBlock(shimDir)}\n`;
}

export function patchRc(rcPath: string, shimDir: string): void {
  const content = existsSync(rcPath) ? readFileSync(rcPath, "utf8") : "";
  writeFileAtomicSync(rcPath, applyRcBlock(content, shimDir));
}

export function unpatchRc(rcPath: string): void {
  if (!existsSync(rcPath)) return;
  writeFileAtomicSync(rcPath, removeRcBlock(readFileSync(rcPath, "utf8")));
}

// ---------------------------------------------------------------------------
// VS Code settings.json
// ---------------------------------------------------------------------------

const ENV_KEYS: Record<string, string> = {
  darwin: "terminal.integrated.env.osx",
  linux: "terminal.integrated.env.linux",
  win32: "terminal.integrated.env.windows",
};

function pathDelimiterFor(platform: NodeJS.Platform): string {
  return platform === "win32" ? ";" : ":";
}

export function vscodeUserDir(
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
): string {
  if (platform === "darwin") return join(home, "Library", "Application Support", "Code", "User");
  if (platform === "win32")
    return join(process.env.APPDATA ?? join(home, "AppData", "Roaming"), "Code", "User");
  return join(home, ".config", "Code", "User");
}

export function vscodeSettingsPath(
  platform: NodeJS.Platform = process.platform,
  home = homedir(),
): string {
  return join(vscodeUserDir(platform, home), "settings.json");
}

// Pure transform of a parsed settings object. Prepends shimDir to the per-OS
// terminal env PATH (via VS Code's ${env:PATH} substitution), sets TK_SHIM_DIR,
// and opts this terminal in to TTY compression (R1). VS Code Copilot's agent runs
// run_in_terminal in a ConPTY (stdout.isTTY=true), so without TK_COMPRESS_TTY the
// gate would pass every agent command through raw; setting it here — alongside the
// shim PATH the agent terminal inherits — is what makes the agent's output actually
// compress. Idempotent: an existing shimDir entry is removed before prepending, so
// re-running does not stack duplicates.
export function applyVscodeEnv(
  settings: Record<string, unknown>,
  shimDir: string,
  platform: NodeJS.Platform = process.platform,
): Record<string, unknown> {
  const key = ENV_KEYS[platform] ?? ENV_KEYS.linux!;
  const delim = pathDelimiterFor(platform);
  const ref = "${env:PATH}";

  const env = { ...(settings[key] as Record<string, string> | undefined) };
  const existing = env.PATH ?? ref;
  const rest = existing
    .split(delim)
    .filter((entry) => entry !== "" && entry !== shimDir)
    .join(delim);
  env.PATH = rest ? `${shimDir}${delim}${rest}` : shimDir;
  env.TK_SHIM_DIR = shimDir;
  env.TK_COMPRESS_TTY = "1";

  return { ...settings, [key]: env };
}

export function removeVscodeEnv(
  settings: Record<string, unknown>,
  shimDir: string,
  platform: NodeJS.Platform = process.platform,
): Record<string, unknown> {
  const key = ENV_KEYS[platform] ?? ENV_KEYS.linux!;
  const delim = pathDelimiterFor(platform);
  const ref = "${env:PATH}";

  const env = { ...(settings[key] as Record<string, string> | undefined) };
  if (Object.keys(env).length === 0) return settings;

  delete env.TK_SHIM_DIR;
  delete env.TK_COMPRESS_TTY;
  if (typeof env.PATH === "string") {
    const rest = env.PATH.split(delim)
      .filter((entry) => entry !== "" && entry !== shimDir)
      .join(delim);
    if (rest === "" || rest === ref) delete env.PATH;
    else env.PATH = rest;
  }

  const next = { ...settings };
  if (Object.keys(env).length === 0) delete next[key];
  else next[key] = env;
  return next;
}

// Shared settings.json I/O — the single read/write path for VS Code user
// settings, used both by the shim (PATH injection) and the context optimizer
// (token-lean settings). Centralizing it keeps the two writers from diverging on
// formatting (2-space + trailing newline) and parse policy (strict JSON only).
export function readSettings(settingsPath: string): Record<string, unknown> {
  if (!existsSync(settingsPath)) return {};
  const text = readFileSync(settingsPath, "utf8").trim();
  if (text === "") return {};
  // We only support strict JSON. If the user's settings.json has comments
  // (JSONC), parsing throws and the caller surfaces a "patch manually" message
  // rather than risk corrupting the file (fail toward not breaking the user).
  return JSON.parse(text) as Record<string, unknown>;
}

export function writeSettings(settingsPath: string, settings: Record<string, unknown>): void {
  mkdirSync(dirname(settingsPath), { recursive: true });
  writeFileAtomicSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
}

export function patchVscodeSettings(
  settingsPath: string,
  shimDir: string,
  platform: NodeJS.Platform = process.platform,
): void {
  writeSettings(settingsPath, applyVscodeEnv(readSettings(settingsPath), shimDir, platform));
}

export function unpatchVscodeSettings(
  settingsPath: string,
  shimDir: string,
  platform: NodeJS.Platform = process.platform,
): void {
  if (!existsSync(settingsPath)) return;
  writeSettings(settingsPath, removeVscodeEnv(readSettings(settingsPath), shimDir, platform));
}

// Default shell RC for the current platform/shell. zsh on macOS, else bashrc.
export function defaultRcPath(home = homedir()): string {
  const shell = process.env.SHELL ?? "";
  if (shell.includes("zsh") || process.platform === "darwin") return join(home, ".zshrc");
  return join(home, ".bashrc");
}
