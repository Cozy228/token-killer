import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type { FilteredResult, RawResult, TgOptions } from "../types.js";
import { historyFile, projectFingerprint, tokenGuardHome } from "./dataDir.js";

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
};

export async function recordHistory(
  raw: RawResult,
  filtered: FilteredResult,
  options: TgOptions,
): Promise<void> {
  const file = historyFile(options.cwd);
  await mkdir(path.dirname(file), { recursive: true });

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

  await writeFile(file, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "a" });
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
  await mkdir(path.dirname(file), { recursive: true });

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

  await writeFile(file, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "a" });
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
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line) as HistoryRecord);
}

// User-level read (ADR 0004 §3): enumerate every project's history.jsonl under
// ~/.token-guard/projects/*/. Best-effort — an unreadable directory or a corrupt
// file is skipped, never thrown. `gain --user` and the telemetry builder both feed
// the rows into the pure aggregate.ts helpers. Each row still carries its own
// project_fingerprint for grouping.
export async function listProjectHistories(): Promise<HistoryRecord[]> {
  const projectsDir = path.join(tokenGuardHome(), "projects");
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
