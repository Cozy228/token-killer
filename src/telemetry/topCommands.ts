import type { HistoryRecord } from "../core/history.js";
import { commandStem } from "./commandStem.js";

export type CommandStemStats = { stem: string; saved: number; count: number };

export function topCommandStems(records: HistoryRecord[], limit = 5): string[] {
  return rankCommandStems(records, limit).map((row) => row.stem);
}

export function rankCommandStems(records: HistoryRecord[], limit = 5): CommandStemStats[] {
  const map = new Map<string, { saved: number; count: number }>();
  for (const record of records) {
    if (!record.command) continue;
    const stem = commandStem(record.command);
    if (!stem) continue;
    const current = map.get(stem) ?? { saved: 0, count: 0 };
    current.saved += record.saved_tokens;
    current.count += 1;
    map.set(stem, current);
  }
  return [...map.entries()]
    .map(([stem, stats]) => ({ stem, saved: stats.saved, count: stats.count }))
    .sort((a, b) => b.saved - a.saved)
    .slice(0, limit);
}
