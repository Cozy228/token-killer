import type { Dirent } from "node:fs";
import { readFileSync, readdirSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { FilteredResult, RawResult, TkOptions } from "../types.js";
import { parseJsonl } from "./jsonl.js";
import {
  historyFile,
  projectFingerprint,
  projectMetaFile,
  projectMetaFileForFingerprint,
  tokenKillerHome,
} from "./dataDir.js";
export type ProjectMeta = { label: string };

export type HistoryRecord = {
  timestamp: string;
  command: string;
  handler: string;
  raw_chars: number;
  output_chars: number;
  raw_tokens: number;
  output_tokens: number;
  saved_tokens: number;
  savings_pct: number;
  exit_code: number;
  duration_ms: number;
  project_fingerprint?: string;
  raw_output_path?: string;
  quality_status?: string;
  // Future-lineage field (DESIGN §8.1): which delivery surface produced this row.
  // `shell` = the command proxy; `terminal_tool` / `direct_tool` = the Copilot hook
  // runtime; `prompt_context` = prompt governance.
  source_adapter?: string;
  // Best-effort model id for per-model pricing (ADR 0004 §1). Populated only by the
  // hook runtime where the delivery surface exposes it (normalize.ts parses it into
  // ToolEvent.model). The shell command-proxy path has no model and leaves it absent;
  // absent rows price at the default constant. Never inferred — absent is honest.
  model?: string;
  // ADR 0009: best-effort agent session id (from `--session <id>` / `TK_SESSION`).
  // Honest-absent like `model` — only stamped when the delivery surface supplied it.
  session_id?: string;
};

// 2.4e — opt-out for latency-critical agents. Set TK_NO_HISTORY=1 to skip the history
// row entirely (documented cost: `tk gain` will not see those commands). Any value
// other than unset/""/"0"/"false" enables it.
function historyDisabled(): boolean {
  const v = process.env.TK_NO_HISTORY;
  return v !== undefined && v !== "" && v !== "0" && v.toLowerCase() !== "false";
}

// Append one JSONL row with a single pre-serialized write (2.4d). APPEND-FIRST: each
// tk command is a fresh process, so a process-scoped "already ensured" memo would
// never hit — the mkdir would still fire every command. Instead we just append; only
// when the dir does not yet exist (ENOENT — the project's first-ever row, or after a
// deletion) do we pay one mkdir and retry. In steady state (dir present on disk) this
// is ZERO mkdir per command. Returns whether the dir had to be created, so the caller
// can write the per-project meta exactly then (and never on the hot path again).
async function appendJsonLine(file: string, line: string): Promise<{ createdDir: boolean }> {
  try {
    await writeFile(file, line, { encoding: "utf8", flag: "a", mode: 0o600 });
    return { createdDir: false };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, line, { encoding: "utf8", flag: "a", mode: 0o600 });
    return { createdDir: true };
  }
}

export async function recordHistory(
  raw: RawResult,
  filtered: FilteredResult,
  options: TkOptions,
): Promise<void> {
  if (historyDisabled()) return;
  const file = historyFile(options.cwd);

  const record: HistoryRecord = {
    timestamp: new Date().toISOString(),
    command: raw.command,
    handler: filtered.handler,
    source_adapter: "shell",
    project_fingerprint: projectFingerprint(options.cwd),
    raw_chars: filtered.rawChars,
    output_chars: filtered.outputChars,
    raw_tokens: filtered.rawTokens,
    output_tokens: filtered.outputTokens,
    saved_tokens: filtered.savedTokens,
    savings_pct: filtered.savingsPct,
    exit_code: raw.exitCode,
    duration_ms: raw.durationMs,
    raw_output_path: filtered.rawOutputPath,
    quality_status: filtered.qualityStatus,
  };
  if (options.sessionId) record.session_id = options.sessionId;

  const { createdDir } = await appendJsonLine(file, `${JSON.stringify(record)}\n`);
  if (createdDir) await writeProjectMeta(options.cwd);
}

// A `--raw` passthrough that STREAMS via stdio:"inherit" (the light path) captures
// no bytes, so it has no honest size to record. We persist only what we genuinely
// know — exit code and wall-clock duration — and OMIT every byte/token field rather
// than fabricate zeros that would read as "tk measured 0 bytes" (it measured none).
// The read boundary (`coerceHistorySizes`) fills the absent fields with 0 so every
// numeric consumer still aggregates safely; the on-disk row stays honest.
type RawLiteRecord = Omit<
  HistoryRecord,
  "raw_chars" | "output_chars" | "raw_tokens" | "output_tokens" | "saved_tokens" | "savings_pct"
>;

export async function recordRawLitePassthrough(params: {
  command: string;
  exitCode: number;
  durationMs: number;
  cwd: string;
  sessionId?: string;
}): Promise<void> {
  if (historyDisabled()) return;
  const file = historyFile(params.cwd);

  const record: RawLiteRecord = {
    timestamp: new Date().toISOString(),
    command: params.command,
    handler: "raw",
    source_adapter: "shell",
    project_fingerprint: projectFingerprint(params.cwd),
    exit_code: params.exitCode,
    duration_ms: params.durationMs,
    quality_status: "passed",
  };
  if (params.sessionId) record.session_id = params.sessionId;

  const { createdDir } = await appendJsonLine(file, `${JSON.stringify(record)}\n`);
  if (createdDir) await writeProjectMeta(params.cwd);
}

// Fill the byte/token fields a light `--raw` row honestly OMITS (see
// recordRawLitePassthrough) with 0 at the read boundary, so numeric consumers never
// see `undefined` (which would poison every sum into NaN). Mutates and returns the
// row; the on-disk JSON is unchanged. Exported so the streaming rollup, which parses
// rows itself instead of through parseHistoryLines, can apply the same coercion.
export function coerceHistorySizes(record: HistoryRecord): HistoryRecord {
  record.raw_chars ??= 0;
  record.output_chars ??= 0;
  record.raw_tokens ??= 0;
  record.output_tokens ??= 0;
  record.saved_tokens ??= 0;
  record.savings_pct ??= 0;
  return record;
}

// Record the project's display label (directory basename only — never the full path)
// for `tk gain --user` (ADR 0004 §3). Called ONLY when the project data dir was just
// created (2.4c) — the moment a project is first seen — so the per-command hot path
// never pays for it. Best-effort: the `wx` flag and the swallowed catch keep it a
// no-op when the meta already exists or the disk rejects the write (display-only).
async function writeProjectMeta(cwd: string): Promise<void> {
  try {
    const meta: ProjectMeta = { label: path.basename(cwd) };
    await writeFile(projectMetaFile(cwd), `${JSON.stringify(meta)}\n`, {
      encoding: "utf8",
      flag: "wx",
      mode: 0o600,
    });
  } catch {
    // already written or unwritable — display-only, safe to skip
  }
}

// Read a project's display label by fingerprint (for `gain --user`). Missing/corrupt
// ⇒ undefined; the caller falls back to the short fingerprint hash.
export async function readProjectMeta(fingerprint: string): Promise<ProjectMeta | undefined> {
  try {
    const text = await readFile(projectMetaFileForFingerprint(fingerprint), "utf8");
    return JSON.parse(text) as ProjectMeta;
  } catch {
    return undefined;
  }
}

// Record a hook-runtime tool failure (DESIGN §3.4, §8.1). Failure metrics ONLY —
// never the failed command text, paths, or error output (privacy: §8.3). Best-
// effort; the caller wraps it so a write error can never break the fail-open hook.
export async function recordHookFailure(params: {
  cwd: string;
  sourceAdapter: "terminal_tool" | "direct_tool";
  handler: string;
  exitCode: number;
}): Promise<void> {
  const file = historyFile(params.cwd);

  const record: HistoryRecord = {
    timestamp: new Date().toISOString(),
    command: "", // never store the failed command text
    handler: params.handler,
    source_adapter: params.sourceAdapter,
    project_fingerprint: projectFingerprint(params.cwd),
    raw_chars: 0,
    output_chars: 0,
    raw_tokens: 0,
    output_tokens: 0,
    saved_tokens: 0,
    savings_pct: 0,
    exit_code: params.exitCode,
    duration_ms: 0,
    quality_status: "failure",
  };

  const { createdDir } = await appendJsonLine(file, `${JSON.stringify(record)}\n`);
  if (createdDir) await writeProjectMeta(params.cwd);
}

export async function readHistory(cwd: string): Promise<HistoryRecord[]> {
  try {
    const text = await readFile(historyFile(cwd), "utf8");
    return parseHistoryLines(text);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

function parseHistoryLines(text: string): HistoryRecord[] {
  return parseJsonl<HistoryRecord>(text).map(coerceHistorySizes);
}

// User-level read (ADR 0004 §3): enumerate every project's history.jsonl under
// ~/.token-killer/projects/*/. Best-effort — an unreadable directory or a corrupt
// file is skipped, never thrown. `gain --user` and the telemetry builder both feed
// the rows into the pure aggregate.ts helpers. Each row still carries its own
// project_fingerprint for grouping.
export async function listProjectHistories(): Promise<HistoryRecord[]> {
  const projectsDir = path.join(tokenKillerHome(), "projects");
  let entries: Dirent[];
  try {
    entries = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const records: HistoryRecord[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(projectsDir, entry.name, "history.jsonl");
    try {
      const text = await readFile(file, "utf8");
      records.push(...parseHistoryLines(text));
    } catch {
      // skip unreadable / corrupt project store
    }
  }
  return records;
}

// Synchronous twin of listProjectHistories, for sync callers (the inspect runtime
// stays synchronous). Same best-effort contract: unreadable stores are skipped.
export function listProjectHistoriesSync(): HistoryRecord[] {
  const projectsDir = path.join(tokenKillerHome(), "projects");
  let entries: Dirent[];
  try {
    entries = readdirSync(projectsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const records: HistoryRecord[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(projectsDir, entry.name, "history.jsonl");
    try {
      records.push(...parseHistoryLines(readFileSync(file, "utf8")));
    } catch {
      // skip unreadable / corrupt project store
    }
  }
  return records;
}
