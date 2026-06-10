// Token-lean VS Code settings (scheme 1 / goal rules `vscode_terminal_compression_disabled`,
// `vscode_context_surface_risk`, `vscode_agent_budget_risk`).
//
// Delivery channel #2 (VS Code-native, not hooks). Copilot ships its OWN terminal
// output compression toggle; the highest-leverage, host-native token control is
// simply turning it on. Per DESIGN §4.5 / the optimizer goal, ONLY
// `chat.tools.compressOutput.enabled: true` is eligible for a direct, restorable
// apply — every other context/agent-budget setting is advisory (it encodes a
// workflow preference or can reduce complex-task success), so we report but never
// auto-change them.
//
// Reversibility contract: apply writes a full-file backup AND a managed-state
// sidecar recording the key's prior presence/value, so `--restore` reverts to the
// exact pre-apply state (restore the old value, or delete the key if it was absent).

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { tokenKillerHome } from "../core/dataDir.js";
import { vscodeSettingsPath, writeSettings } from "../shim/hostConfig.js";
import { writeBackup } from "./applySafe.js";
import type { OptimizeArgs } from "./optimizeCli.js";

// VS Code settings.json uses flat, dotted top-level keys (e.g.
// "chat.tools.compressOutput.enabled": true), not nested objects.
export const COMPRESS_KEY = "chat.tools.compressOutput.enabled";

// §14 vscode_context_surface_risk — advisory only, never auto-changed.
const CONTEXT_SURFACE_RULES: { key: string; risky: (v: unknown) => boolean; note: string }[] = [
  { key: "chat.includeReferencedInstructions", risky: (v) => v === true, note: "auto-includes referenced instruction files in every request" },
  { key: "chat.useNestedAgentsMdFiles", risky: (v) => v === true, note: "loads nested AGENTS.md files down the tree" },
  { key: "chat.useCustomizationsInParentRepositories", risky: (v) => v === true, note: "pulls customizations from parent repositories" },
  { key: "github.copilot.chat.additionalReadAccessFolders", risky: (v) => Array.isArray(v) && v.length > 0, note: "grants extra read-access folders" },
  { key: "chat.mcp.discovery.enabled", risky: (v) => v === true, note: "auto-discovers MCP servers (extra tool surface)" },
  { key: "github.copilot.chat.codesearch.enabled", risky: (v) => v === true, note: "enables repo-wide code-search context" },
  { key: "github.copilot.chat.edits.suggestRelatedFilesFromGitHistory", risky: (v) => v === true, note: "pulls related files from git history" },
];

// §15 vscode_agent_budget_risk — advisory only.
function budgetRisks(settings: Record<string, unknown>): string[] {
  const out: string[] = [];
  const maxReq = settings["chat.agent.maxRequests"];
  if (typeof maxReq === "number" && maxReq > 15) {
    out.push(`chat.agent.maxRequests = ${maxReq} (>15; token-control profiles use 8–12)`);
  }
  if (settings["github.copilot.chat.agent.autoFix"] === true) {
    out.push("github.copilot.chat.agent.autoFix = true (extra autonomous tool turns)");
  }
  return out;
}

export type VscodeSettingsAnalysis = {
  compress: "on" | "off";
  contextRisks: string[];
  budgetRisks: string[];
};

export function analyzeVscodeSettings(settings: Record<string, unknown>): VscodeSettingsAnalysis {
  return {
    compress: settings[COMPRESS_KEY] === true ? "on" : "off",
    contextRisks: CONTEXT_SURFACE_RULES.filter((r) => r.risky(settings[r.key])).map(
      (r) => `${r.key}: ${r.note}`,
    ),
    budgetRisks: budgetRisks(settings),
  };
}

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
    return { status: "ok", settings: JSON.parse(text) as Record<string, unknown>, text };
  } catch {
    // JSONC / malformed — never risk corrupting it; tell the user to edit manually.
    return { status: "parse_error" };
  }
}

// ── managed-state sidecar (for restore) ──────────────────────────────────────

type CompressState = { priorPresent: boolean; prior: unknown; appliedAt: string };

function statePath(): string {
  return join(tokenKillerHome(), "state", "vscode-compress.json");
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

// ── apply / restore / report (write to stdout, return exit code) ──────────────

const PARSE_HINT = (settingsPath: string) =>
  `tk optimize: ${settingsPath} is not strict JSON (comments?). Set "${COMPRESS_KEY}": true manually.\n`;

export function applyCompress(settingsPath: string, nowMs: number): number {
  const read = readVscodeSettingsFile(settingsPath);
  if (read.status === "parse_error") {
    process.stderr.write(PARSE_HINT(settingsPath));
    return 1;
  }
  const settings = read.status === "ok" ? read.settings : {};
  if (settings[COMPRESS_KEY] === true) {
    process.stdout.write(`tk optimize: ${COMPRESS_KEY} already enabled in ${settingsPath} (no change).\n`);
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
    process.stdout.write(`tk optimize: no managed ${COMPRESS_KEY} change to restore.\n`);
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

export function renderVscodeReport(settingsPath: string, a: VscodeSettingsAnalysis): string {
  const out: string[] = ["# tk optimize --vscode-settings", `Settings file: ${settingsPath}`, ""];
  if (a.compress === "on") {
    out.push(`[ok] ${COMPRESS_KEY} is enabled — terminal output is compressed before reaching the model.`);
  } else {
    out.push(`[off] ${COMPRESS_KEY} is not enabled.`);
    out.push("  Apply with: tk optimize --vscode-settings --apply");
    out.push("  (host-native terminal output compression; restorable, user-level only.)");
  }
  out.push("");
  out.push(
    a.contextRisks.length === 0
      ? "Context-surface settings: none flagged."
      : "Context-surface settings (advisory — review, not auto-changed):",
  );
  for (const r of a.contextRisks) out.push(`  - ${r}`);
  out.push("");
  out.push(
    a.budgetRisks.length === 0
      ? "Agent-budget settings: none flagged."
      : "Agent-budget settings (advisory — review, not auto-changed):",
  );
  for (const r of a.budgetRisks) out.push(`  - ${r}`);
  return `${out.join("\n")}\n`;
}

export function runVscodeSettings(
  args: OptimizeArgs,
  nowMs: number = Date.now(),
  home: string = homedir(),
): number {
  const settingsPath = vscodeSettingsPath(process.platform, home);
  if (args.restore) return restoreCompress(settingsPath, nowMs);
  if (args.apply) return applyCompress(settingsPath, nowMs);

  // Default / --dry-run: report only.
  const read = readVscodeSettingsFile(settingsPath);
  if (read.status === "parse_error") {
    process.stderr.write(PARSE_HINT(settingsPath));
    return 1;
  }
  const settings = read.status === "ok" ? read.settings : {};
  process.stdout.write(renderVscodeReport(settingsPath, analyzeVscodeSettings(settings)));
  return 0;
}
