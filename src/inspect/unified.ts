// Unified finding model (DESIGN §9.0). Runtime and static-context analyzers
// converge into a single Finding[]. Runtime findings carry aggregate metrics; static
// context findings carry surface/file/lines (from src/context). The persisted
// scope-bucket report is `{ ..., findings: Finding[] }`; `tk optimize context`
// reads the bucket and filters to source = "static_context".
//
// Runtime findings are AGGREGATED, not one-per-tool. The earlier model mapped every
// ranked opportunity 1:1 — so a busy session produced ~100 findings, almost all
// `info`, most for built-in tools (read_file / list_directory) the user has no lever
// over, each with an empty "where" and a generic "high output volume… narrow scope"
// fix. That buried the genuinely actionable findings (skills, context, delivery).
// Instead we emit a handful of ACTIONABLE, deduplicated findings — each with a real
// `where` (the place to act) and an impact-based severity (by token volume) — and
// roll un-leverable native-tool volume into a single orientation-cost finding.

import { createHash } from "node:crypto";

import type { ContextFinding } from "../context/types.js";
import type { McpAnalysis } from "./mcp.js";
import { MCP_TOKENS_PER_SERVER_ESTIMATE } from "./footprint.js";
import type { HabitStats } from "./habits.js";
import { LONG_PROMPT_CHARS } from "./habits.js";
import type { Opportunity, ScanResult } from "./scan.js";
import type { ToolCategory } from "../hook/normalize.js";

export type FindingSource = "runtime" | "static_context";

export type RuntimeFinding = {
  id: string;
  source: "runtime";
  type: string;
  severity: "info" | "warn" | "error";
  confidence: number;
  evidence: string;
  recommendation: string;
  fix_class: "safe_mechanical" | "suggested_diff" | "advisory" | "delivery" | "non_goal";
  category?: string;
  scope?: "user" | "project";
  // Actionable location — the place the user acts, not a transcript file. Runtime
  // findings have no source file, so without this the report's "Where" was always
  // empty. Examples: "AGENTS.md / CONTEXT.md", "Terminal (install the tk shim)".
  where?: string;
  metrics: RuntimeMetrics;
};

export type RuntimeMetrics = {
  count: number;
  share: number;
  total_output_chars: number;
  total_output_tokens: number;
  avg_output_chars: number;
  max_output_chars: number;
  total_input_chars: number;
  max_input_chars: number;
  success_count: number;
  failure_count: number;
};

export type Finding = RuntimeFinding | ContextFinding;

// Severity by the token volume a finding concerns — so the "Fix now / Worth fixing /
// Minor" buckets reflect real cost, not a flat `info`. Thresholds are deliberately
// coarse; a finding type may also set a minimum floor (e.g. delivery is never below
// `warn` because it is directly, losslessly fixable).
const ERROR_TOKENS = 40_000;
const WARN_TOKENS = 5_000;
const MIN_OCC = 3;

// Native direct-tool categories the user cannot compress or re-route (no shim lever,
// no governance hook): their per-tool "high output volume" findings were pure noise.
// Their READ/SEARCH/LIST volume is instead rolled into one orientation-cost finding.
const ORIENTATION_CATEGORIES: ToolCategory[] = ["read", "search", "list"];

function severityFor(tokens: number, floor: "info" | "warn" = "info"): RuntimeFinding["severity"] {
  let s: RuntimeFinding["severity"] =
    tokens >= ERROR_TOKENS ? "error" : tokens >= WARN_TOKENS ? "warn" : "info";
  if (floor === "warn" && s === "info") s = "warn";
  return s;
}

function runtimeFindingId(key: string): string {
  return `rt_${createHash("sha256").update(key).digest("hex").slice(0, 10)}`;
}

// Sum the per-opportunity metrics across a set, for the finding's `metrics` block.
function aggregateMetrics(opps: Opportunity[]): RuntimeMetrics {
  const m: RuntimeMetrics = {
    count: 0,
    share: 0,
    total_output_chars: 0,
    total_output_tokens: 0,
    avg_output_chars: 0,
    max_output_chars: 0,
    total_input_chars: 0,
    max_input_chars: 0,
    success_count: 0,
    failure_count: 0,
  };
  for (const o of opps) {
    m.count += o.count;
    m.share += o.share;
    m.total_output_chars += o.total_output_chars;
    m.total_output_tokens += o.total_output_tokens;
    m.max_output_chars = Math.max(m.max_output_chars, o.max_output_chars);
    m.total_input_chars += o.total_input_chars;
    m.max_input_chars = Math.max(m.max_input_chars, o.max_input_chars);
    m.success_count += o.success_count;
    m.failure_count += o.failure_count;
  }
  m.avg_output_chars = m.count === 0 ? 0 : Math.round(m.total_output_chars / m.count);
  return m;
}

function inCategories(o: Opportunity, cats: ToolCategory[]): boolean {
  return cats.includes(o.category);
}

// Build the aggregated, actionable runtime finding set from one scan (+ habits & MCP
// analysis). Returns at most a handful of findings — never one-per-tool.
export function runtimeFindings(
  scan: ScanResult | undefined,
  habits?: HabitStats,
  mcp?: McpAnalysis,
): RuntimeFinding[] {
  if (!scan) return [];
  const out: RuntimeFinding[] = [];

  // 1) Uncompressed commands — shell commands the proxy could compress, run raw.
  //    ONE aggregate finding (was one per command), naming the top offenders.
  const compressible = scan.opportunities.filter(
    (o) => o.kind === "shell" && o.compressible && o.key !== "tk",
  );
  const rawCount = compressible.reduce((s, o) => s + o.count, 0);
  if (rawCount >= MIN_OCC) {
    const top = [...compressible]
      .sort((a, b) => b.total_output_tokens - a.total_output_tokens)
      .slice(0, 3)
      .map((o) => `\`${o.key}\``);
    const rawTokens = compressible.reduce((s, o) => s + o.total_output_tokens, 0);
    const isCopilot = scan.inputType === "copilot-cli";
    out.push({
      id: runtimeFindingId("uncompressed_commands"),
      source: "runtime",
      type: "uncompressed_commands",
      severity: severityFor(rawTokens, "warn"),
      confidence: 0.9,
      evidence: `${rawCount} shell command(s) ran raw (~${rawTokens} tok of output)${top.length ? `; e.g. ${top.join(", ")}` : ""}.`,
      recommendation: isCopilot
        ? "Run `tk install --host copilot-cli` to wire the rewrite hook so these commands flow through tk, which compresses their output losslessly."
        : "Run `tk install` (installs the PATH shim) and restart your editor — tk then compresses these commands' output losslessly.",
      fix_class: "delivery",
      where: isCopilot
        ? "Copilot CLI hook (run `tk install --host copilot-cli`)"
        : "Terminal PATH (run `tk install`)",
      metrics: aggregateMetrics(compressible),
    });
  }

  // 2) Orientation cost — read/search/list volume, INCLUDING native tools the user
  //    can't re-route. One finding instead of a per-tool dump; the fix is durable
  //    context + scoped reads, not "narrow scope" on each built-in.
  const orientation = scan.opportunities.filter((o) => inCategories(o, ORIENTATION_CATEGORIES));
  const orientCount = orientation.reduce((s, o) => s + o.count, 0);
  if (orientCount >= MIN_OCC * 4) {
    const orientTokens = orientation.reduce((s, o) => s + o.total_output_tokens, 0);
    out.push({
      id: runtimeFindingId("orientation_cost"),
      source: "runtime",
      type: "orientation_cost",
      severity: severityFor(orientTokens, "info"),
      confidence: 0.65,
      evidence: `${orientCount} read/search/list actions (~${orientTokens} tok) spent locating code across the session(s).`,
      recommendation:
        "Record the project's layout and key entry points in durable context (AGENTS.md / CONTEXT.md), and read scoped ranges instead of whole files — so the agent stops re-deriving structure every session.",
      fix_class: "advisory",
      where: "AGENTS.md / CONTEXT.md (durable project context)",
      metrics: aggregateMetrics(orientation),
    });
  }

  // 3) Repeated failures — aggregate across commands, name the top offenders. Each
  //    retry re-discovers the same problem and burns tokens.
  const failing = scan.opportunities
    .filter((o) => o.failure_count >= MIN_OCC)
    .sort((a, b) => b.failure_count - a.failure_count);
  if (failing.length > 0) {
    const totalFail = failing.reduce((s, o) => s + o.failure_count, 0);
    const names = failing.slice(0, 3).map((o) => `\`${o.key}\` (${o.failure_count}×)`);
    out.push({
      id: runtimeFindingId("repeated_failures"),
      source: "runtime",
      type: "repeated_failures",
      severity: failing.length >= 2 || totalFail >= 8 ? "warn" : "info",
      confidence: 0.7,
      evidence: `${totalFail} failed tool call(s) across ${failing.length} command(s): ${names.join(", ")}.`,
      recommendation:
        "Record the working invocation / constraint in AGENTS.md so the agent stops re-discovering the same failure on every run.",
      fix_class: "advisory",
      where: "AGENTS.md (record the working invocation)",
      metrics: aggregateMetrics(failing),
    });
  }

  // 4) Dependency / lockfile reads — aggregate of the governance "deny" signal.
  const denyTotal = scan.opportunities.reduce((s, o) => s + o.governed_deny, 0);
  if (denyTotal >= MIN_OCC) {
    const denyOpps = scan.opportunities.filter((o) => o.governed_deny > 0);
    out.push({
      id: runtimeFindingId("dependency_reads"),
      source: "runtime",
      type: "dependency_reads",
      severity: denyTotal >= 10 ? "warn" : "info",
      confidence: 0.8,
      evidence: `${denyTotal} direct read(s) targeted dependency dirs, build output, or lockfiles.`,
      recommendation:
        "Read source instead of generated files; a hook pre-tool deny can block oversized dependency/lockfile reads before they reach the model.",
      fix_class: "advisory",
      where: "Agent read policy (hook pre-tool deny)",
      metrics: aggregateMetrics(denyOpps),
    });
  }

  // 5) Habit cost-tips (how the user DRIVES the agent) — already aggregate by nature.
  if (habits && habits.sessions > 0) {
    if (habits.avg_tool_calls_per_session >= 20) {
      out.push({
        id: runtimeFindingId("long_agent_loops"),
        source: "runtime",
        type: "long_agent_loops",
        severity: "warn",
        confidence: 0.7,
        evidence: `Sessions average ${habits.avg_tool_calls_per_session} tool calls (max ${habits.max_tool_calls_in_session}); every extra turn re-sends the growing transcript.`,
        recommendation:
          "Scope each session to one task and start a fresh session for the next — the whole transcript is re-sent every turn, so cost compounds as a session grows.",
        fix_class: "advisory",
        where: "How you drive the agent (session length)",
        metrics: zeroMetrics(habits.total_tool_calls),
      });
    }
    if (habits.long_prompt_count >= MIN_OCC) {
      out.push({
        id: runtimeFindingId("oversized_prompts"),
        source: "runtime",
        type: "oversized_prompts",
        severity: "info",
        confidence: 0.65,
        evidence: `${habits.long_prompt_count} prompt(s) exceeded ${LONG_PROMPT_CHARS} chars (avg ${habits.avg_prompt_chars}, max ${habits.max_prompt_chars}).`,
        recommendation:
          "Point at files and name the exact decision instead of pasting context — write as little as required, as much as necessary.",
        fix_class: "advisory",
        where: "How you write prompts",
        metrics: zeroMetrics(habits.long_prompt_count),
      });
    }
  }

  // 6) MCP server bloat — config-derived (every server's tool schemas load each
  //    session). `where` points at the actual config file(s).
  if (mcp && mcp.servers.length >= MCP_SERVER_LIMIT) {
    const shown = mcp.servers.slice(0, 6).join(", ");
    out.push({
      id: runtimeFindingId("mcp_bloat"),
      source: "runtime",
      type: "mcp_bloat",
      severity: mcp.servers.length >= 6 ? "warn" : "info",
      confidence: 0.7,
      evidence: `${mcp.servers.length} MCP server(s)${shown ? ` (${shown}${mcp.servers.length > 6 ? ", …" : ""})` : ""} — ≈${mcp.servers.length * MCP_TOKENS_PER_SERVER_ESTIMATE} tok of tool schemas (estimated) load into every session's context.`,
      recommendation:
        "Disable servers you aren't using in this workspace, and prefer a CLI (gh/aws/gcloud) over its MCP where one exists — far fewer tokens per call.",
      fix_class: "advisory",
      where: mcp.sources.length ? mcp.sources.join(", ") : "your MCP server config",
      metrics: zeroMetrics(mcp.servers.length),
    });
  }

  return out;
}

// A zero-volume metrics block for findings derived from config / habits rather than
// tool output (so the shape stays uniform). `count` carries the representative tally.
function zeroMetrics(count: number): RuntimeMetrics {
  return {
    count,
    share: 0,
    total_output_chars: 0,
    total_output_tokens: 0,
    avg_output_chars: 0,
    max_output_chars: 0,
    total_input_chars: 0,
    max_input_chars: 0,
    success_count: 0,
    failure_count: 0,
  };
}

// Default: 3+ MCP servers is where their always-on tool schemas start to take a large
// share of the context window (kept in sync with advice.ts MCP_SERVER_LIMIT).
export const MCP_SERVER_LIMIT = 3;
