// Slice 4 — inspect report rendering (inspect-v1-design.md "Output Model").
// Markdown is the default; `--json` switches to JSON. Neither carries raw evidence
// — only sanitized labels, lengths, and counts.

import type { ContextFinding } from "../context/types.js";
import type { AdviceFinding } from "./advice.js";
import type { RepoContext } from "./repoContext.js";
import type { Opportunity, ScanResult } from "./scan.js";
import type { Finding } from "./unified.js";

export type Report = {
  schemaVersion: "1";
  generatedAt: string;
  inputType: string;
  session_inventory: number;
  transcript_coverage: number;
  tool_event_count: number;
  unknown_time_records: number;
  coverage_errors: number;
  opportunities: Opportunity[];
  repo_context?: RepoContext;
  advice?: AdviceFinding[];
  // Static-context analyzer output (goal): the source = static_context slice of
  // the unified report, plus the merged unified Finding[].
  static_context?: { files_scanned: number; findings: ContextFinding[] };
  findings?: Finding[];
};

export function buildReport(
  scan: ScanResult,
  generatedAt: string,
  repoContext?: RepoContext,
  advice?: AdviceFinding[],
): Report {
  return {
    schemaVersion: "1",
    generatedAt,
    inputType: scan.inputType,
    session_inventory: scan.session_inventory,
    transcript_coverage: scan.transcript_coverage,
    tool_event_count: scan.tool_event_count,
    unknown_time_records: scan.unknown_time_records,
    coverage_errors: scan.coverage_errors,
    opportunities: scan.opportunities,
    ...(repoContext ? { repo_context: repoContext } : {}),
    ...(advice ? { advice } : {}),
  };
}

export function renderJson(report: Report): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

const MARKDOWN_TOP = 10;

function pct(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

export function renderMarkdown(report: Report): string {
  const lines: string[] = [];
  lines.push("# Token Killer Inspect");
  lines.push("");
  lines.push(`- Input type: \`${report.inputType}\``);
  lines.push(`- Session inventory: ${report.session_inventory}`);
  lines.push(`- Transcript coverage (files with tool events): ${report.transcript_coverage}`);
  lines.push(`- Tool events analyzed: ${report.tool_event_count}`);
  lines.push(`- Unknown-time records: ${report.unknown_time_records}`);
  if (report.coverage_errors > 0) lines.push(`- Coverage errors: ${report.coverage_errors}`);
  lines.push("");

  if (report.repo_context) {
    const rc = report.repo_context;
    lines.push("## Repository context");
    lines.push("");
    lines.push(`- git repo: ${rc.has_git ? "yes" : "no"}`);
    lines.push(`- package manifest: ${rc.has_package_manifest ? "yes" : "no"}`);
    lines.push(`- CONTEXT doc: ${rc.has_context_doc ? "yes" : "no"}`);
    lines.push(`- ADR index: ${rc.has_adr_index ? "yes" : "no"}`);
    lines.push(`- skill/rules file: ${rc.has_skill_or_rules ? "yes" : "no"}`);
    lines.push("");
  }

  lines.push("## Opportunities (ranked by output volume — cost heuristic, not a token bill)");
  lines.push("");
  if (report.opportunities.length === 0) {
    lines.push("_No tool events found to analyze._");
    lines.push("");
    return `${lines.join("\n")}\n`;
  }

  lines.push("| Command/Tool | count | share | out chars (≈tok) | avg out | max out | in chars | max in | ok | fail |");
  lines.push("|---|--:|--:|--:|--:|--:|--:|--:|--:|--:|");
  for (const o of report.opportunities.slice(0, MARKDOWN_TOP)) {
    lines.push(
      `| \`${o.key}\` | ${o.count} | ${pct(o.share)} | ${o.total_output_chars} (≈${o.total_output_tokens}) | ${o.avg_output_chars} | ${o.max_output_chars} | ${o.total_input_chars} | ${o.max_input_chars} | ${o.success_count} | ${o.failure_count} |`,
    );
  }
  if (report.opportunities.length > MARKDOWN_TOP) {
    lines.push("");
    lines.push(`_+${report.opportunities.length - MARKDOWN_TOP} more in \`--json\` output._`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}
