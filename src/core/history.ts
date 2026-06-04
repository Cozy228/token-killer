import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { FilteredResult, RawResult, TgOptions } from "../types.js";
import { historyFile, projectFingerprint } from "./dataDir.js";

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

export async function readHistory(cwd: string): Promise<HistoryRecord[]> {
  try {
    const text = await readFile(historyFile(cwd), "utf8");
    return text
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as HistoryRecord);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
