// Token-lean VS Code settings — the host-native terminal-output compression toggle.
//
// Copilot ships its OWN terminal-output compression toggle; the highest-leverage,
// host-native token control is simply turning it on. `vscodeCompressFinding` reports
// it to the inspect static-context pipeline (a `vscode_compress_disabled` finding)
// and `ctx optimize --apply` enables it via `applyCompress`. Only
// `chat.tools.compressOutput.enabled: true` is auto-applied; nothing else here is.
//
// Reversibility contract: apply writes a full-file backup AND a managed-state
// sidecar recording the key's prior presence/value, so `--restore` reverts to the
// exact pre-apply state (restore the old value, or delete the key if it was absent).

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { contexaHome } from "../core/dataDir.js";
import { parseJsonc } from "../core/jsonc.js";
import { vscodeSettingsPath, writeSettings } from "../shim/hostConfig.js";
import { writeBackup } from "./applySafe.js";
import type { ContextFinding } from "./types.js";

// VS Code settings.json uses flat, dotted top-level keys (e.g.
// "chat.tools.compressOutput.enabled": true), not nested objects.
export const COMPRESS_KEY = "chat.tools.compressOutput.enabled";

// ── settings.json read (parse-safe) ──────────────────────────────────────────

export type ReadResult =
  | { status: "ok"; settings: Record<string, unknown>; text: string }
  | { status: "missing" }
  | { status: "parse_error" };

export function readVscodeSettingsFile(settingsPath: string): ReadResult {
  if (!existsSync(settingsPath)) return { status: "missing" };
  const text = readFileSync(settingsPath, "utf8");
  if (text.trim() === "") return { status: "missing" };
  try {
    // JSONC-tolerant: VS Code settings.json legally has comments / trailing commas.
    return { status: "ok", settings: parseJsonc(text) as Record<string, unknown>, text };
  } catch {
    // Genuinely malformed — never risk corrupting it; tell the user to edit manually.
    return { status: "parse_error" };
  }
}

// ── managed-state sidecar (for restore) ──────────────────────────────────────

type CompressState = { priorPresent: boolean; prior: unknown; appliedAt: string };

function statePath(): string {
  return join(contexaHome(), "state", "vscode-compress.json");
}

function writeState(state: CompressState): void {
  const p = statePath();
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, `${JSON.stringify(state, null, 2)}\n`);
}

function readState(): CompressState | undefined {
  const p = statePath();
  if (!existsSync(p)) return undefined;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as CompressState;
  } catch {
    return undefined;
  }
}

// True when a managed compress change is on disk (so `ctx optimize --restore` knows
// it has a VS Code settings edit to revert, on top of any markdown backups).
export function hasManagedCompressState(): boolean {
  return existsSync(statePath());
}

// ── inspect finding (the VS Code settings issue inspect reports) ──────────────

// A single user-scope static-context finding when VS Code's host-native terminal-
// output compression is off (or its settings.json is unreadable). Returned to the
// inspect static-context pipeline so `ctx optimize --apply` can enable it. Absent
// when settings.json is missing (not a VS Code user) or compression is already on.
export function vscodeCompressFinding(
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): ContextFinding | undefined {
  const settingsPath = vscodeSettingsPath(platform, home);
  const read = readVscodeSettingsFile(settingsPath);
  if (read.status === "missing") return undefined;
  if (read.status === "parse_error") {
    return {
      id: "sc_vscode_compress",
      source: "static_context",
      type: "vscode_compress_disabled",
      severity: "warn",
      confidence: 0.9,
      surface: "vscode_settings",
      scope: "user",
      file: settingsPath,
      evidence: `${settingsPath} is not strict JSON, so ${COMPRESS_KEY} could not be checked.`,
      recommendation: `Fix the JSON, then set "${COMPRESS_KEY}": true to compress terminal output before it reaches the model.`,
      fix_class: "advisory",
    };
  }
  if (read.settings[COMPRESS_KEY] === true) return undefined; // already enabled
  return {
    id: "sc_vscode_compress",
    source: "static_context",
    type: "vscode_compress_disabled",
    severity: "warn",
    confidence: 0.95,
    surface: "vscode_settings",
    scope: "user",
    file: settingsPath,
    evidence: `VS Code's built-in terminal-output compression (${COMPRESS_KEY}) is off, so full command output reaches the model.`,
    recommendation: `Enable ${COMPRESS_KEY} to compress terminal output (host-native, reversible with ctx optimize --restore).`,
    fix_class: "safe_mechanical",
  };
}

// ── apply / restore / report (write to stdout, return exit code) ──────────────

const PARSE_HINT = (settingsPath: string) =>
  `ctx optimize: ${settingsPath} is not strict JSON (comments?). Set "${COMPRESS_KEY}": true manually.\n`;

export function applyCompress(settingsPath: string, nowMs: number): number {
  const read = readVscodeSettingsFile(settingsPath);
  if (read.status === "parse_error") {
    process.stderr.write(PARSE_HINT(settingsPath));
    return 1;
  }
  const settings = read.status === "ok" ? read.settings : {};
  if (settings[COMPRESS_KEY] === true) {
    process.stdout.write(
      `ctx optimize: ${COMPRESS_KEY} already enabled in ${settingsPath} (no change).\n`,
    );
    return 0;
  }

  if (read.status === "ok") {
    const backup = writeBackup(settingsPath, read.text, nowMs);
    process.stdout.write(`Backup: ${backup}\n`);
  }
  writeState({
    priorPresent: COMPRESS_KEY in settings,
    prior: settings[COMPRESS_KEY],
    appliedAt: new Date(nowMs).toISOString(),
  });
  writeSettings(settingsPath, { ...settings, [COMPRESS_KEY]: true });
  process.stdout.write(`Enabled ${COMPRESS_KEY} in ${settingsPath}\n`);
  process.stdout.write(`  + "${COMPRESS_KEY}": true\n`);
  return 0;
}

export function restoreCompress(settingsPath: string, nowMs: number): number {
  const state = readState();
  if (!state) {
    process.stdout.write(`ctx optimize: no managed ${COMPRESS_KEY} change to restore.\n`);
    return 0;
  }
  const read = readVscodeSettingsFile(settingsPath);
  if (read.status === "parse_error") {
    process.stderr.write(PARSE_HINT(settingsPath));
    return 1;
  }
  const settings = read.status === "ok" ? read.settings : {};
  if (read.status === "ok") {
    const backup = writeBackup(settingsPath, read.text, nowMs);
    process.stdout.write(`Backup: ${backup}\n`);
  }
  const next = { ...settings };
  if (state.priorPresent) next[COMPRESS_KEY] = state.prior;
  else delete next[COMPRESS_KEY];
  writeSettings(settingsPath, next);
  rmSync(statePath());
  process.stdout.write(
    state.priorPresent
      ? `Restored ${COMPRESS_KEY} = ${JSON.stringify(state.prior)} in ${settingsPath}\n`
      : `Removed ${COMPRESS_KEY} from ${settingsPath} (was absent before apply)\n`,
  );
  return 0;
}
