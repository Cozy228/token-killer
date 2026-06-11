// Cold-path rollup cache for ledger ① (history.jsonl). Append-only JSONL stays the
// source of truth; rollup.json is rebuilt on `tk gain` / telemetry reads only — never
// updated on the `tk <cmd>` hot path so runtime is unaffected. Never deletes history.

import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import path from "node:path";

import { FALLBACK_HANDLER, type GainSummary, type TimeBucket } from "./aggregate.js";
import {
  historyFile,
  projectDataDir,
  projectFingerprint,
  tokenKillerHome,
  fingerprintSegment,
} from "./dataDir.js";
import { coerceHistorySizes, type HistoryRecord } from "./history.js";
import { commandStem } from "../telemetry/commandStem.js";

function pct(saved: number, raw: number): number {
  return raw === 0 ? 0 : Number(((saved / raw) * 100).toFixed(1));
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export const ROLLUP_VERSION = 1 as const;
const RECENT_CAP = 100;
const FAILURE_CAP = 200;
const HOUR_RETENTION_HOURS = 48;

export type HandlerRollup = { raw: number; saved: number; count: number };
export type DayRollup = { commands: number; raw: number; saved: number };
export type HourRollup = { commands: number; saved: number };

export type RollupRecent = {
  timestamp: string;
  command: string;
  handler: string;
  savings_pct: number;
  project_fingerprint?: string;
};

export type RollupFailure = {
  timestamp: string;
  handler: string;
  quality_status: string;
  exit_code: number;
  project_fingerprint?: string;
};

export type ProjectRollup = {
  version: typeof ROLLUP_VERSION;
  source_lines: number;
  // Fast-path cache stamp: history.jsonl is append-only, so an unchanged byte size
  // AND mtime prove the rollup is still current WITHOUT reading the file to recount
  // lines. Optional for back-compat — a rollup written before this existed simply
  // misses the fast path once, gets stamped, then hits it. (Perf: see the read-skip
  // in ensureProjectRollup / listProjectRollups — the dominant `tk gain --user` cost.)
  source_bytes?: number;
  source_mtime_ms?: number;
  project_fingerprint: string;
  totals: {
    commands: number;
    raw_tokens: number;
    output_tokens: number;
    saved_tokens: number;
    total_duration_ms: number;
  };
  by_handler: Record<string, HandlerRollup>;
  by_command_stem: Record<string, HandlerRollup>;
  quality_status_counts: Record<string, number>;
  by_day: Record<string, DayRollup>;
  by_hour: Record<string, HourRollup>;
  saved_tokens_by_model: Record<string, number>;
  source_adapter_mix: Record<string, number>;
  fallback_count: number;
  recent: RollupRecent[];
  failures: RollupFailure[];
};

export type MergedRollup = ProjectRollup;

export function rollupFile(cwd: string): string {
  return path.join(projectDataDir(cwd), "rollup.json");
}

export function rollupFileForFingerprint(fingerprint: string): string {
  return path.join(tokenKillerHome(), "projects", fingerprintSegment(fingerprint), "rollup.json");
}

function fingerprintFromDirEntry(entry: string): string {
  if (entry.startsWith("repo:")) return entry;
  if (entry.startsWith("repo-")) return `repo:${entry.slice(5)}`;
  return entry;
}

export function emptyRollup(fingerprint: string): ProjectRollup {
  return {
    version: ROLLUP_VERSION,
    source_lines: 0,
    project_fingerprint: fingerprint,
    totals: {
      commands: 0,
      raw_tokens: 0,
      output_tokens: 0,
      saved_tokens: 0,
      total_duration_ms: 0,
    },
    by_handler: {},
    by_command_stem: {},
    quality_status_counts: {},
    by_day: {},
    by_hour: {},
    saved_tokens_by_model: {},
    source_adapter_mix: {},
    fallback_count: 0,
    recent: [],
    failures: [],
  };
}

function hourKey(timestamp: string): string {
  return new Date(timestamp).toISOString().slice(0, 13);
}

function qualityStatus(record: HistoryRecord): string {
  return record.quality_status ?? "passed";
}

function isFailure(record: HistoryRecord): boolean {
  return record.handler === FALLBACK_HANDLER || record.quality_status === "failure";
}

function modelKey(record: HistoryRecord): string {
  return record.model ?? "";
}

export function applyRecord(rollup: ProjectRollup, record: HistoryRecord, now = new Date()): void {
  // A light `--raw` row omits its byte/token fields on disk (honest: it captured
  // none). Fill them with 0 before summing so a missing field never poisons a total
  // into NaN; the on-disk row is untouched.
  coerceHistorySizes(record);
  rollup.source_lines += 1;
  rollup.totals.commands += 1;
  rollup.totals.raw_tokens += record.raw_tokens;
  rollup.totals.output_tokens += record.output_tokens;
  rollup.totals.saved_tokens += record.saved_tokens;
  rollup.totals.total_duration_ms += record.duration_ms;

  const handler = rollup.by_handler[record.handler] ?? { raw: 0, saved: 0, count: 0 };
  handler.raw += record.raw_tokens;
  handler.saved += record.saved_tokens;
  handler.count += 1;
  rollup.by_handler[record.handler] = handler;

  if (record.command) {
    const stem = commandStem(record.command);
    if (stem) {
      const cmd = rollup.by_command_stem[stem] ?? { raw: 0, saved: 0, count: 0 };
      cmd.raw += record.raw_tokens;
      cmd.saved += record.saved_tokens;
      cmd.count += 1;
      rollup.by_command_stem[stem] = cmd;
    }
  }

  const status = qualityStatus(record);
  rollup.quality_status_counts[status] = (rollup.quality_status_counts[status] ?? 0) + 1;

  const day = dayKey(new Date(record.timestamp));
  const dayBucket = rollup.by_day[day] ?? { commands: 0, raw: 0, saved: 0 };
  dayBucket.commands += 1;
  dayBucket.raw += record.raw_tokens;
  dayBucket.saved += record.saved_tokens;
  rollup.by_day[day] = dayBucket;

  const hour = hourKey(record.timestamp);
  const hourBucket = rollup.by_hour[hour] ?? { commands: 0, saved: 0 };
  hourBucket.commands += 1;
  hourBucket.saved += record.saved_tokens;
  rollup.by_hour[hour] = hourBucket;
  pruneHourBuckets(rollup, now);

  const mk = modelKey(record);
  rollup.saved_tokens_by_model[mk] = (rollup.saved_tokens_by_model[mk] ?? 0) + record.saved_tokens;

  const adapter = record.source_adapter ?? "unknown";
  rollup.source_adapter_mix[adapter] = (rollup.source_adapter_mix[adapter] ?? 0) + 1;

  if (record.handler === FALLBACK_HANDLER) rollup.fallback_count += 1;

  if (record.command) {
    rollup.recent.push({
      timestamp: record.timestamp,
      command: record.command,
      handler: record.handler,
      savings_pct: record.savings_pct,
      project_fingerprint: record.project_fingerprint,
    });
    if (rollup.recent.length > RECENT_CAP) {
      rollup.recent = rollup.recent.slice(-RECENT_CAP);
    }
  }

  if (isFailure(record)) {
    rollup.failures.push({
      timestamp: record.timestamp,
      handler: record.handler,
      quality_status: status,
      exit_code: record.exit_code,
      project_fingerprint: record.project_fingerprint,
    });
    if (rollup.failures.length > FAILURE_CAP) {
      rollup.failures = rollup.failures.slice(-FAILURE_CAP);
    }
  }
}

export function pruneHourBuckets(rollup: ProjectRollup, now: Date): void {
  const cutoff = now.getTime() - HOUR_RETENTION_HOURS * 3_600_000;
  for (const key of Object.keys(rollup.by_hour)) {
    const ts = new Date(`${key}:00:00.000Z`).getTime();
    if (Number.isFinite(ts) && ts < cutoff) delete rollup.by_hour[key];
  }
}

export function mergeRollups(rollups: ProjectRollup[]): MergedRollup {
  const merged = emptyRollup("merged");
  merged.project_fingerprint = "merged";
  for (const rollup of rollups) {
    merged.source_lines += rollup.source_lines;
    merged.totals.commands += rollup.totals.commands;
    merged.totals.raw_tokens += rollup.totals.raw_tokens;
    merged.totals.output_tokens += rollup.totals.output_tokens;
    merged.totals.saved_tokens += rollup.totals.saved_tokens;
    merged.totals.total_duration_ms += rollup.totals.total_duration_ms;
    merged.fallback_count += rollup.fallback_count;

    for (const [handler, stats] of Object.entries(rollup.by_handler)) {
      const current = merged.by_handler[handler] ?? { raw: 0, saved: 0, count: 0 };
      current.raw += stats.raw;
      current.saved += stats.saved;
      current.count += stats.count;
      merged.by_handler[handler] = current;
    }
    for (const [stem, stats] of Object.entries(rollup.by_command_stem ?? {})) {
      const current = merged.by_command_stem[stem] ?? { raw: 0, saved: 0, count: 0 };
      current.raw += stats.raw;
      current.saved += stats.saved;
      current.count += stats.count;
      merged.by_command_stem[stem] = current;
    }
    for (const [status, count] of Object.entries(rollup.quality_status_counts)) {
      merged.quality_status_counts[status] = (merged.quality_status_counts[status] ?? 0) + count;
    }
    for (const [day, stats] of Object.entries(rollup.by_day)) {
      const current = merged.by_day[day] ?? { commands: 0, raw: 0, saved: 0 };
      current.commands += stats.commands;
      current.raw += stats.raw;
      current.saved += stats.saved;
      merged.by_day[day] = current;
    }
    for (const [hour, stats] of Object.entries(rollup.by_hour)) {
      const current = merged.by_hour[hour] ?? { commands: 0, saved: 0 };
      current.commands += stats.commands;
      current.saved += stats.saved;
      merged.by_hour[hour] = current;
    }
    for (const [model, saved] of Object.entries(rollup.saved_tokens_by_model)) {
      merged.saved_tokens_by_model[model] = (merged.saved_tokens_by_model[model] ?? 0) + saved;
    }
    for (const [adapter, count] of Object.entries(rollup.source_adapter_mix)) {
      merged.source_adapter_mix[adapter] = (merged.source_adapter_mix[adapter] ?? 0) + count;
    }

    merged.recent.push(...rollup.recent);
    merged.failures.push(...rollup.failures);
  }

  merged.recent.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  merged.recent = merged.recent.slice(0, RECENT_CAP);
  merged.failures.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  merged.failures = merged.failures.slice(0, FAILURE_CAP);
  return merged;
}

export function topCommandStemsFromRollup(rollup: MergedRollup, limit = 5): string[] {
  return Object.entries(rollup.by_command_stem ?? {})
    .map(([stem, stats]) => ({ stem, saved: stats.saved }))
    .sort((a, b) => b.saved - a.saved)
    .slice(0, limit)
    .map((row) => row.stem);
}

export function rollupToGainSummary(rollup: MergedRollup): GainSummary {
  const { totals } = rollup;
  const by_handler = Object.entries(rollup.by_handler)
    .map(([handler, stats]) => ({
      handler,
      raw: stats.raw,
      saved: stats.saved,
      pct: pct(stats.saved, stats.raw),
      count: stats.count,
    }))
    .sort((a, b) => b.saved - a.saved);

  // L1: the headline figure is the NET (raw − output). A handler that legitimately
  // inflates (a structural reformat larger than raw) then REDUCES the total instead of
  // being clamped to 0 per-row and silently rounded up. Clamp once here at the display
  // boundary so the number is never negative; per-command rows stay clamped (a single
  // inflating command shows 0, the aggregate nets it out honestly).
  const netSaved = Math.max(0, totals.raw_tokens - totals.output_tokens);

  return {
    estimate_kind: "measured",
    commands: totals.commands,
    raw_tokens: totals.raw_tokens,
    output_tokens: totals.output_tokens,
    saved_tokens: netSaved,
    savings_pct: pct(netSaved, totals.raw_tokens),
    avg_savings_per_command: totals.commands === 0 ? 0 : Math.round(netSaved / totals.commands),
    total_duration_ms: totals.total_duration_ms,
    by_handler,
    quality_status_counts: { ...rollup.quality_status_counts },
  };
}

export function allDaysFromRollup(rollup: MergedRollup): TimeBucket[] {
  return Object.entries(rollup.by_day)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, stats]) => ({
      key,
      commands: stats.commands,
      raw: stats.raw,
      saved: stats.saved,
      pct: pct(stats.saved, stats.raw),
    }));
}

export function dailyBucketsFromRollup(
  rollup: MergedRollup,
  n = 30,
  now = new Date(),
): TimeBucket[] {
  const present = new Map(
    Object.entries(rollup.by_day).map(([key, stats]) => [
      key,
      {
        key,
        commands: stats.commands,
        raw: stats.raw,
        saved: stats.saved,
        pct: pct(stats.saved, stats.raw),
      },
    ]),
  );
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const result: TimeBucket[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const day = new Date(today.getTime() - i * 86_400_000);
    const key = dayKey(day);
    result.push(present.get(key) ?? { key, commands: 0, raw: 0, saved: 0, pct: 0 });
  }
  return result;
}

export function weekBucketsFromRollup(rollup: MergedRollup): TimeBucket[] {
  return bucketDaysBy(rollup, isoWeekKey);
}

export function monthBucketsFromRollup(rollup: MergedRollup): TimeBucket[] {
  return bucketDaysBy(rollup, (d) => d.toISOString().slice(0, 7));
}

function bucketDaysBy(rollup: MergedRollup, keyOf: (date: Date) => string): TimeBucket[] {
  const buckets = new Map<string, { commands: number; raw: number; saved: number }>();
  for (const [day, stats] of Object.entries(rollup.by_day)) {
    const key = keyOf(new Date(`${day}T00:00:00.000Z`));
    const current = buckets.get(key) ?? { commands: 0, raw: 0, saved: 0 };
    current.commands += stats.commands;
    current.raw += stats.raw;
    current.saved += stats.saved;
    buckets.set(key, current);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, stats]) => ({
      key,
      commands: stats.commands,
      raw: stats.raw,
      saved: stats.saved,
      pct: pct(stats.saved, stats.raw),
    }));
}

function isoWeekKey(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function last24hFromRollup(
  rollup: MergedRollup,
  now = new Date(),
): { commands: number; saved: number } {
  const cutoff = now.getTime() - 86_400_000;
  let commands = 0;
  let saved = 0;
  for (const [hour, stats] of Object.entries(rollup.by_hour)) {
    const ts = new Date(`${hour}:00:00.000Z`).getTime();
    if (Number.isFinite(ts) && ts >= cutoff) {
      commands += stats.commands;
      saved += stats.saved;
    }
  }
  return { commands, saved };
}

export function savedTokens30dFromRollup(rollup: MergedRollup, now = new Date()): number {
  const cutoffMs = now.getTime() - 30 * 86_400_000;
  let saved = 0;
  for (const [day, stats] of Object.entries(rollup.by_day)) {
    const ts = new Date(`${day}T00:00:00.000Z`).getTime();
    if (Number.isFinite(ts) && ts >= cutoffMs) saved += stats.saved;
  }
  return saved;
}

export async function saveRollup(cwd: string, rollup: ProjectRollup): Promise<void> {
  await writeFile(rollupFile(cwd), `${JSON.stringify(rollup)}\n`, "utf8");
}

export async function loadRollupFile(file: string): Promise<ProjectRollup | null> {
  try {
    const text = await readFile(file, "utf8");
    const parsed = JSON.parse(text.trim()) as ProjectRollup;
    if (parsed.version !== ROLLUP_VERSION) return null;
    return parsed;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    return null;
  }
}

async function countJsonlLines(file: string): Promise<number> {
  try {
    const text = await readFile(file, "utf8");
    if (!text.trim()) return 0;
    let count = 0;
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] === "\n") count += 1;
    }
    if (!text.endsWith("\n")) count += 1;
    return count;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw error;
  }
}

export async function rebuildRollupFromJsonl(cwd: string): Promise<ProjectRollup> {
  const fingerprint = projectFingerprint(cwd);
  const rollup = emptyRollup(fingerprint);
  const file = historyFile(cwd);
  const stream = createReadStream(file, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const now = new Date();
  for await (const line of lines) {
    if (!line.trim()) continue;
    try {
      applyRecord(rollup, JSON.parse(line) as HistoryRecord, now);
    } catch {
      // skip corrupt lines — jsonl is still source of truth for manual repair
    }
  }
  return rollup;
}

// Cheap existence/size probe — one stat syscall, never reads file contents. Returns
// null for a missing/unreadable file (treated as "no history").
async function statHistory(file: string): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    const s = await stat(file);
    return { size: s.size, mtimeMs: s.mtimeMs };
  } catch {
    return null;
  }
}

function stampMatches(rollup: ProjectRollup, st: { size: number; mtimeMs: number }): boolean {
  return rollup.source_bytes === st.size && rollup.source_mtime_ms === st.mtimeMs;
}

export async function ensureProjectRollup(cwd: string): Promise<ProjectRollup> {
  const file = historyFile(cwd);
  const st = await statHistory(file);
  if (!st || st.size === 0) return emptyRollup(projectFingerprint(cwd));

  const existing = await loadRollupFile(rollupFile(cwd));
  // Fast path: append-only history with an unchanged (size, mtime) stamp ⇒ the rollup
  // is current. Return it WITHOUT reading the file to count lines — that full read was
  // the per-project cost behind slow `tk gain --user` (worst on Windows, where AV
  // scans every file open).
  if (existing && stampMatches(existing, st)) {
    pruneHourBuckets(existing, new Date());
    return existing;
  }

  const lineCount = await countJsonlLines(file);
  if (lineCount === 0) return emptyRollup(projectFingerprint(cwd));

  if (existing && existing.source_lines === lineCount) {
    // Line count matches but the byte/mtime stamp is absent or stale (a rollup written
    // before the fast path existed). Refresh the stamp and persist so the NEXT read
    // takes the fast path; no full rebuild needed.
    existing.source_bytes = st.size;
    existing.source_mtime_ms = st.mtimeMs;
    pruneHourBuckets(existing, new Date());
    try {
      await saveRollup(cwd, existing);
    } catch {
      // best-effort cache refresh
    }
    return existing;
  }

  const rebuilt = await rebuildRollupFromJsonl(cwd);
  // The cache key is the PHYSICAL line count (countJsonlLines). applyRecord counts
  // only PARSED records, so a single corrupt/blank line left source_lines < lineCount
  // and every `tk gain` rebuilt + rewrote the rollup forever (M5). Pin source_lines to
  // the physical count so an unchanged file is a cache hit next time.
  rebuilt.source_lines = lineCount;
  rebuilt.source_bytes = st.size;
  rebuilt.source_mtime_ms = st.mtimeMs;
  try {
    await saveRollup(cwd, rebuilt);
  } catch {
    // best-effort cache — gain still works from rebuilt in memory
  }
  return rebuilt;
}

export async function listProjectRollups(): Promise<ProjectRollup[]> {
  const projectsDir = path.join(tokenKillerHome(), "projects");
  let entries: string[];
  try {
    const { readdir } = await import("node:fs/promises");
    entries = await readdir(projectsDir);
  } catch {
    return [];
  }

  const rollups: ProjectRollup[] = [];
  for (const entry of entries) {
    const hist = path.join(projectsDir, entry, "history.jsonl");
    const rollupPath = path.join(projectsDir, entry, "rollup.json");

    const st = await statHistory(hist);
    if (!st || st.size === 0) continue;

    let rollup = await loadRollupFile(rollupPath);
    // Fast path: append-only history with a matching (size, mtime) stamp ⇒ cached
    // rollup is current; skip reading the file at all. This per-project full read was
    // what made `tk gain --user` slow across many projects / on Windows.
    if (rollup && stampMatches(rollup, st)) {
      rollups.push(rollup);
      continue;
    }

    const lineCount = await countJsonlLines(hist);
    if (lineCount === 0) continue;

    if (!rollup || rollup.source_lines !== lineCount) {
      try {
        rollup = await rebuildRollupAtPath(
          hist,
          rollup?.project_fingerprint ?? fingerprintFromDirEntry(entry),
        );
        // Pin source_lines to the PHYSICAL count (M5) and stamp size/mtime so the next
        // `--user` read takes the fast path instead of re-reading this file.
        rollup.source_lines = lineCount;
        rollup.source_bytes = st.size;
        rollup.source_mtime_ms = st.mtimeMs;
        await writeFile(rollupPath, `${JSON.stringify(rollup)}\n`, "utf8");
      } catch {
        continue;
      }
    } else {
      // Cache valid by line count but missing the byte/mtime stamp (older rollup) —
      // stamp & persist so subsequent reads skip the file.
      rollup.source_bytes = st.size;
      rollup.source_mtime_ms = st.mtimeMs;
      try {
        await writeFile(rollupPath, `${JSON.stringify(rollup)}\n`, "utf8");
      } catch {
        // best-effort stamp refresh
      }
    }
    if (rollup) rollups.push(rollup);
  }
  return rollups;
}

async function rebuildRollupAtPath(
  historyPath: string,
  fingerprint: string,
): Promise<ProjectRollup> {
  const rollup = emptyRollup(fingerprint);
  const stream = createReadStream(historyPath, { encoding: "utf8" });
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const now = new Date();
  for await (const line of lines) {
    if (!line.trim()) continue;
    try {
      applyRecord(rollup, JSON.parse(line) as HistoryRecord, now);
    } catch {
      // skip corrupt line
    }
  }
  return rollup;
}
