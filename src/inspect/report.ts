// Slice 4 — inspect report rendering (inspect-v1-design.md "Output Model").
// Markdown is the default; `--json` switches to JSON. Neither carries raw evidence
// — only sanitized labels, lengths, and counts.

import type { ContextFinding } from "../context/types.js";
import type { AdviceFinding } from "./advice.js";
import type { Footprint } from "./footprint.js";
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
  // Standing per-session token cost breakdown (instructions / skills / agents / MCP).
  footprint?: Footprint;
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
const ACTIONS_TOP = 5;

function pct(share: number): string {
  return `${(share * 100).toFixed(1)}%`;
}

// Action items, in priority order, derived from the advice findings inspect already
// computes. This is what the user should DO — printed first so the report leads with
// next steps, not a raw data dump.
function actionLines(report: Report): string[] {
  const advice = report.advice ?? [];
  if (advice.length === 0) return [];
  const out: string[] = ["## What to do", ""];
  advice.slice(0, ACTIONS_TOP).forEach((f, i) => {
    out.push(`${i + 1}. ${f.title}`);
    out.push(`   → ${f.recommendation}`);
  });
  if (advice.length > ACTIONS_TOP) {
    out.push("");
    out.push(`_+${advice.length - ACTIONS_TOP} more — see \`tk inspect --advice\`._`);
  }
  out.push("");
  return out;
}

// Honest coverage line. The point of the I3/I4 work is that inspect must never
// silently report a hollow number: if it discovered sessions but could not read any
// tool activity out of them, it says so plainly and tells the user what to try —
// rather than printing "Sessions: 8 / Tool actions: 0" and an empty table that reads
// like everything is fine.
function couldNotReadSessions(report: Report): string[] {
  const inputHint =
    report.inputType === "vscode"
      ? "If you drive the agent from the Copilot CLI instead, run `tk inspect --input-type copilot-cli`."
      : "If you use VS Code Copilot instead, run `tk inspect --input-type vscode`.";
  return [
    "## Couldn't read your agent activity",
    "",
    `Found ${report.session_inventory} session(s) but extracted **0 tool actions** from them — so there's nothing to analyze yet.`,
    "",
    "This usually means the transcripts live somewhere tk didn't look, or in a format it doesn't recognize. What to try:",
    `- ${inputHint}`,
    "- Run the agent through a turn that uses terminal/file tools, then re-run `tk inspect`.",
    "- If this persists, the host changed its on-disk format — please file an issue with your host + version.",
    "",
  ];
}

export function renderMarkdown(report: Report): string {
  const lines: string[] = ["# Token Killer Inspect", ""];

  // Lead with action items (what to do), if inspect found anything actionable.
  lines.push(...actionLines(report));

  // Honest diagnostic: sessions discovered but nothing readable came out of them.
  if (report.session_inventory > 0 && report.tool_event_count === 0) {
    lines.push(...couldNotReadSessions(report));
  }

  // Plain-language coverage summary (honest counts, framed as supporting detail).
  lines.push("## Coverage");
  lines.push("");
  lines.push(`- Input type: \`${report.inputType}\``);
  lines.push(`- Sessions found: ${report.session_inventory}`);
  lines.push(`- Sessions with readable tool activity: ${report.transcript_coverage}`);
  lines.push(`- Tool actions analyzed: ${report.tool_event_count}`);
  if (report.unknown_time_records > 0) {
    lines.push(`- Records skipped (no reliable timestamp): ${report.unknown_time_records}`);
  }
  if (report.coverage_errors > 0) {
    lines.push(`- Files tk could not read/parse: ${report.coverage_errors}`);
  }
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

  if (report.opportunities.length === 0) {
    // No table to show. The honest block above already explained an empty scan; a
    // healthy scan with no opportunities means the activity is already lean.
    if (report.tool_event_count > 0) {
      lines.push("_No token-saving opportunities found — your agent activity is already lean._");
      lines.push("");
    }
    return `${lines.join("\n")}\n`;
  }

  lines.push("## Where the tokens go (cost heuristic, not a token bill)");
  lines.push("");
  lines.push(
    "| Command/Tool | count | share | out chars (≈tok) | avg out | max out | in chars | max in | ok | fail |",
  );
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
