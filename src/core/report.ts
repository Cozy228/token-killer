import type { TgOptions } from "../types.js";
import { readHistory } from "./history.js";

export async function buildReport(options: TgOptions): Promise<string> {
  const records = await readHistory(options.cwd);
  const raw = records.reduce((sum, record) => sum + record.raw_tokens, 0);
  const output = records.reduce((sum, record) => sum + record.output_tokens, 0);
  const saved = records.reduce((sum, record) => sum + record.saved_tokens, 0);
  const savingsPct = raw === 0 ? 0 : Number(((saved / raw) * 100).toFixed(1));

  if (options.reportFormat === "json") {
    return `${JSON.stringify({ commands: records.length, raw, output, saved, savingsPct })}\n`;
  }

  if (options.reportFormat === "csv") {
    return [
      "commands,raw_tokens,output_tokens,saved_tokens,savings_pct",
      `${records.length},${raw},${output},${saved},${savingsPct}`,
      "",
    ].join("\n");
  }

  const byHandler = new Map<string, { raw: number; saved: number }>();
  for (const record of records) {
    const current = byHandler.get(record.handler) ?? { raw: 0, saved: 0 };
    current.raw += record.raw_tokens;
    current.saved += record.saved_tokens;
    byHandler.set(record.handler, current);
  }
  const handlers = [...byHandler.entries()]
    .map(([handler, stats]) => {
      const pct = stats.raw === 0 ? 0 : Number(((stats.saved / stats.raw) * 100).toFixed(1));
      return `- ${handler}: ${pct}%`;
    })
    .join("\n");

  const byQuality = new Map<string, number>();
  for (const record of records) {
    const status = record.quality_status ?? "unknown";
    byQuality.set(status, (byQuality.get(status) ?? 0) + 1);
  }
  const quality = [...byQuality.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `- ${status}: ${count}`)
    .join("\n");

  return [
    "Token Savings Report",
    `Commands: ${records.length}`,
    `Raw: ${raw} tokens`,
    `Output: ${output} tokens`,
    `Saved: ${saved} tokens (${savingsPct}%)`,
    "",
    "Top handlers:",
    handlers || "- none: 0%",
    "",
    "Quality:",
    quality || "- none: 0",
    "",
  ].join("\n");
}
