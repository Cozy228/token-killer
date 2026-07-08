// Slice 4 — inspect report rendering (inspect-v1-design.md "Output Model").
// Markdown is the default; `--json` switches to JSON. Neither carries raw evidence
// — only sanitized labels, lengths, and counts.

import type { ContextFinding } from "../context/types.js";
import type { AdviceFinding } from "./advice.js";
import type { Footprint } from "./footprint.js";
import type { RepoContext } from "./repoContext.js";
import type { Opportunity, ScanResult } from "./scan.js";
import type { SessionTokenDetail } from "./sessionTokens.js";
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
  // MEASURED token usage from session logs that record it (Copilot CLI's
  // `session.shutdown`). Ground truth — not the char-based estimate used elsewhere.
  session_tokens?: SessionTokenDetail;
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
    out.push(`_+${advice.length - ACTIONS_TOP} more — see \`ctx inspect --advice\`._`);
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
  const hasVscode = report.inputType.includes("vscode");
  const hasCopilot = report.inputType.includes("copilot");
  const inputHint =
    hasVscode && hasCopilot
      ? "ctx checked both VS Code and the Copilot CLI — if you drive the agent from another host, its transcripts live elsewhere."
      : hasVscode
        ? "If you drive the agent from the Copilot CLI instead, run `ctx inspect --input-type copilot-cli`."
        : "If you use VS Code Copilot instead, run `ctx inspect --input-type vscode`.";
  return [
    "## Couldn't read your agent activity",
    "",
    `Found ${report.session_inventory} session(s) but extracted **0 tool actions** from them — so there's nothing to analyze yet.`,
    "",
    "This usually means the transcripts live somewhere ctx didn't look, or in a format it doesn't recognize. What to try:",
    `- ${inputHint}`,
    "- Run the agent through a turn that uses terminal/file tools, then re-run `ctx inspect`.",
    "- If this persists, the host changed its on-disk format — please file an issue with your host + version.",
    "",
  ];
}

// Compact token magnitude: 184321 → "184k", 1_240_000 → "1.2M", 79 → "79".
function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return `${n}`;
}

// How many per-session rows to print in markdown (the rest are in --json).
const SESSIONS_TOP = 10;

const CATEGORY_SHORT: Record<string, string> = {
  execute_adjacent: "execute",
  "agent-orchestration": "agent",
};
function shortCategory(c: string): string {
  return CATEGORY_SHORT[c] ?? c;
}

// Per-tool flags surfaced in the breakdown (what ctx can act on).
function oppFlags(o: Opportunity): string {
  const f: string[] = [];
  if (o.compressible) f.push("compressible");
  if (o.large_output_count > 0) f.push("large");
  if (o.governed_deny > 0) f.push("deny");
  return f.length ? ` _(${f.join(", ")})_` : "";
}

function successRate(o: Opportunity): string {
  const total = o.success_count + o.failure_count;
  return total === 0 ? "—" : `${Math.round((o.success_count / total) * 100)}%`;
}

// "Where your tokens go" — the unified analysis of every past session. Measured
// totals (ground truth from session.shutdown) up top, then the per-model, per-session
// and per-tool detail that explains where the tokens went. Same sessions, more zoom.
function tokensGoLines(report: Report): string[] {
  const st = report.session_tokens;
  const opps = report.opportunities;
  // Nothing measured AND no tool activity → no analysis section at all.
  if ((!st || st.sessions === 0) && opps.length === 0) return [];

  const out: string[] = ["## Where your tokens go", ""];

  if (st && st.sessions > 0) {
    const promptTotal = st.input + st.cache_read + st.cache_write;
    const hitRate = promptTotal > 0 ? `${Math.round((st.cache_read / promptTotal) * 100)}%` : "n/a";
    out.push(
      `Measured across ${st.sessions} session(s) that recorded usage (ground truth, not an estimate):`,
    );
    out.push("");
    out.push(`- Prompt tokens      ${fmtTokens(promptTotal)}  (cache hit ${hitRate})`);
    out.push(`-   ├ fresh input    ${fmtTokens(st.input)}`);
    out.push(`-   ├ cache read     ${fmtTokens(st.cache_read)}`);
    out.push(`-   └ cache write    ${fmtTokens(st.cache_write)}`);
    out.push(
      `- Output             ${fmtTokens(st.output)}${st.reasoning > 0 ? ` (incl. ${fmtTokens(st.reasoning)} reasoning)` : ""}`,
    );
    out.push(`- Premium requests   ${st.premium_requests}`);
    out.push("");

    if (st.models.length > 0) {
      out.push("### By model");
      out.push("");
      out.push(
        "| Model | reqs | input | output | cache read | cache write | reasoning | premium |",
      );
      out.push("|---|--:|--:|--:|--:|--:|--:|--:|");
      for (const m of st.models) {
        out.push(
          `| \`${m.model}\` | ${m.requests} | ${fmtTokens(m.inputTokens)} | ${fmtTokens(m.outputTokens)} | ${fmtTokens(m.cacheReadTokens)} | ${fmtTokens(m.cacheWriteTokens)} | ${fmtTokens(m.reasoningTokens)} | ${Number(m.cost.toFixed(2))} |`,
        );
      }
      out.push("");
    }

    if (st.bySession.length > 0) {
      out.push("### By session");
      out.push("");
      out.push("| Session | model | prompt | output | cache hit | premium |");
      out.push("|---|---|--:|--:|--:|--:|");
      for (const s of st.bySession.slice(0, SESSIONS_TOP)) {
        out.push(
          `| \`${s.id}\` | ${s.model || "—"} | ${fmtTokens(s.prompt)} | ${fmtTokens(s.output)} | ${Math.round(s.cache_hit * 100)}% | ${s.premium} |`,
        );
      }
      if (st.bySession.length > SESSIONS_TOP) {
        out.push("");
        out.push(`_+${st.bySession.length - SESSIONS_TOP} more session(s) in \`--json\` output._`);
      }
      out.push("");
    }
  }

  if (opps.length > 0) {
    out.push("### By tool & command");
    out.push("");
    out.push(
      "What the agent ran, with per-tool token traffic (input + output, a chars→tokens estimate). " +
        (st && st.sessions > 0 ? "The measured totals above are the ground truth." : "") +
        " Share is each tool's portion of total tool token traffic.",
    );
    out.push("");
    // Denominator for the token share: total in+out tokens across ALL tools.
    const toolTokens = (o: Opportunity): number => o.total_input_tokens + o.total_output_tokens;
    const totalToolTokens = opps.reduce((s, o) => s + toolTokens(o), 0);
    const shareOf = (o: Opportunity): string =>
      totalToolTokens === 0 ? "0.0%" : `${((toolTokens(o) / totalToolTokens) * 100).toFixed(1)}%`;
    out.push(
      "| Command/Tool | category | calls | in ≈tok | out ≈tok | total ≈tok | tok share | success |",
    );
    out.push("|---|---|--:|--:|--:|--:|--:|--:|");
    for (const o of opps.slice(0, MARKDOWN_TOP)) {
      out.push(
        `| \`${o.key}\`${oppFlags(o)} | ${shortCategory(o.category)} | ${o.count} | ≈${o.total_input_tokens} | ≈${o.total_output_tokens} | ≈${toolTokens(o)} | ${shareOf(o)} | ${successRate(o)} |`,
      );
    }
    if (opps.length > MARKDOWN_TOP) {
      out.push("");
      out.push(`_+${opps.length - MARKDOWN_TOP} more in \`--json\` output._`);
    }
    out.push("");
  }

  if (st?.last_context) {
    const c = st.last_context;
    out.push("### Standing context cost (most recent session)");
    out.push("");
    out.push(
      `Re-sent every turn before you type: tool defs ${fmtTokens(c.tool_definitions)} · system ${fmtTokens(c.system)} · conversation ${fmtTokens(c.conversation)}.`,
    );
    out.push("");
  }
  return out;
}

// inspect produces a read-only ANALYSIS of every past session, then the potential
// optimizations that fall out of it. So the report reads analysis-first: coverage →
// where your tokens go (measured + per-tool detail) → repo context → finally "What to
// do" (the optimization points), which cite the analysis above.
export function renderMarkdown(report: Report): string {
  const lines: string[] = ["# Contexa Inspect", ""];

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
    lines.push(`- Files ctx could not read/parse: ${report.coverage_errors}`);
  }
  lines.push("");

  // The unified analysis: measured token spend + per-model / per-session / per-tool
  // detail. Empty only when there is no measured usage AND no tool activity.
  const tokensGo = tokensGoLines(report);
  if (tokensGo.length > 0) {
    lines.push(...tokensGo);
  } else if (report.tool_event_count > 0) {
    lines.push("_No token-saving opportunities found — your agent activity is already lean._");
    lines.push("");
  }

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

  // Close with the optimization points derived from the analysis above.
  lines.push(...actionLines(report));

  return `${lines.join("\n")}\n`;
}
