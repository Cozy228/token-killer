// ADR 0009 — the dedup accounting ledger. Dedup hits are recorded in a DEDICATED
// `dedup-events.jsonl` per project, NEVER in history.jsonl, so a dedup saving can
// never be summed into ledger ① (filter savings) by applyRecord or any other
// history consumer. `tk gain` reads this and renders a separate "Session dedup"
// line — mirroring VS Code PR #315905's `cacheHit` field, which is reported apart
// from compression savings. Append-only, fail-open: accounting never breaks the
// hot path, and a missing/corrupt file reads as zero events.

import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { dedupEventsFile, tokenKillerHome } from "./dataDir.js";
import { parseJsonl } from "./jsonl.js";

export type DedupEvent = {
  ts: string;
  // Best-effort session id (honest-absent). Attribute only.
  session_id?: string;
  norm_cmd: string;
  handler: string;
  ttl_class: string;
  // Tokens the compressed repeat WOULD have cost, the marker that replaced it, and
  // the difference saved by suppressing the re-delivery.
  output_tokens: number;
  marker_tokens: number;
  saved_tokens: number;
  raw_pointer?: string;
};

export async function appendDedupEvent(cwd: string, event: DedupEvent): Promise<void> {
  try {
    const file = dedupEventsFile(cwd);
    await mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
    await writeFile(file, `${JSON.stringify(event)}\n`, {
      encoding: "utf8",
      flag: "a",
      mode: 0o600,
    });
  } catch {
    // accounting must never break the hot path
  }
}

export async function readDedupEvents(cwd: string): Promise<DedupEvent[]> {
  try {
    return parseJsonl<DedupEvent>(await readFile(dedupEventsFile(cwd), "utf8"));
  } catch {
    return [];
  }
}

// User-level read: every project's dedup-events.jsonl. Best-effort — an unreadable
// directory or corrupt file is skipped, never thrown (mirrors listProjectHistories).
export async function listAllDedupEvents(): Promise<DedupEvent[]> {
  const projectsDir = path.join(tokenKillerHome(), "projects");
  let entries: Dirent[];
  try {
    entries = await readdir(projectsDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: DedupEvent[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(projectsDir, entry.name, "dedup-events.jsonl");
    try {
      out.push(...parseJsonl<DedupEvent>(await readFile(file, "utf8")));
    } catch {
      // skip unreadable / corrupt store
    }
  }
  return out;
}

export type DedupSummary = {
  hits: number;
  saved_tokens: number;
  by_command: Array<{ command: string; hits: number; saved: number }>;
};

export function summarizeDedup(events: DedupEvent[]): DedupSummary {
  let saved = 0;
  const byCmd = new Map<string, { hits: number; saved: number }>();
  for (const e of events) {
    saved += e.saved_tokens;
    const current = byCmd.get(e.norm_cmd) ?? { hits: 0, saved: 0 };
    current.hits += 1;
    current.saved += e.saved_tokens;
    byCmd.set(e.norm_cmd, current);
  }
  const by_command = [...byCmd.entries()]
    .map(([command, s]) => ({ command, hits: s.hits, saved: s.saved }))
    .sort((a, b) => b.saved - a.saved || b.hits - a.hits || a.command.localeCompare(b.command));
  return { hits: events.length, saved_tokens: saved, by_command };
}

// Most-recent-first events for `tk gain --history` (labeled as dedup rows).
export function recentDedupEvents(events: DedupEvent[], n: number): DedupEvent[] {
  return [...events].sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, n);
}
