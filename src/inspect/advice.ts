// Slice 5 — advice generation (DESIGN §10, inspect-v1-design.md "Recommendation
// Model"). Pattern detection over the scan model. Privacy-preserving: findings
// carry sanitized labels and counts only — never raw evidence.
//
// Advice LEADS with a delivery recommendation (the shim-primary model makes "how
// is `tk` even reaching this host?" the first question), then per-command and
// governance findings.

import { LONG_PROMPT_CHARS, type HabitStats } from "./habits.js";
import type { Opportunity, ScanResult } from "./scan.js";

export type AdviceType =
  | "delivery"
  | "shell-noise"
  | "tool-noise"
  | "workflow-friction"
  | "skill-gap"
  | "context-gap"
  | "storage-discovery"
  // Habit-based cost tips (Copilot CLI `/chronicle cost tips` parity): how the user
  // DRIVES the agent — turn depth, prompt length, repeated failures — costs tokens.
  | "cost-tip";

export type AdviceFinding = {
  type: AdviceType;
  title: string;
  detail: string;
  occurrences: number;
  confidence: number;
  recommendation: string;
};

export type AdviceOptions = {
  minConfidence: number;
  minOccurrences: number;
};

export const DEFAULT_ADVICE_OPTIONS: AdviceOptions = {
  minConfidence: 0.6,
  minOccurrences: 3,
};

function clampConfidence(n: number): number {
  return Math.max(0, Math.min(0.99, Number(n.toFixed(2))));
}

// Shell opportunities the proxy could compress but were run raw (key !== "tk").
function compressibleRaw(scan: ScanResult): Opportunity[] {
  return scan.opportunities.filter((o) => o.kind === "shell" && o.compressible && o.key !== "tk");
}

// Total invocations across opportunities in the given tool categories.
function countByCategory(scan: ScanResult, categories: string[]): number {
  return scan.opportunities
    .filter((o) => categories.includes(o.category))
    .reduce((sum, o) => sum + o.count, 0);
}

// Workflow-signal analyzers (DESIGN §"Skill and context gap analyzer"). These were
// declared AdviceTypes but never emitted (I3 root-cause c). They are diagnostic,
// privacy-safe (derived from category COUNTS only), and identify gaps — they never
// draft a SKILL.md or edit context files. Thresholds are deliberately above the
// generic minOccurrences so a couple of incidental reads don't trip them.
function workflowGapFindings(scan: ScanResult, opts: AdviceOptions): AdviceFinding[] {
  const out: AdviceFinding[] = [];

  // storage-discovery: sessions exist on disk but NOTHING analyzable came out of
  // them — the transcripts are stored somewhere tk did not look, or in a format the
  // reader could not descend. This is exactly the "inspect is empty" symptom; tell
  // the user where coverage broke rather than silently reporting nothing.
  if (scan.tool_event_count === 0 && scan.session_inventory >= opts.minOccurrences) {
    out.push({
      type: "storage-discovery",
      title: "Sessions found but no analyzable tool activity",
      detail: `${scan.session_inventory} session record(s) discovered but 0 tool events were read — transcripts may live elsewhere or in an unrecognized format.`,
      occurrences: scan.session_inventory,
      confidence: 0.7,
      recommendation:
        "Confirm the host stores Copilot transcripts under VS Code user storage; if it relocated them, re-run inspect once they are in the default location.",
    });
    // When we read nothing, the gap analyzers below have no signal — return early.
    return out;
  }

  // skill-gap: heavy, repeated manual context-gathering (file reads) signals a
  // recurring workflow a reusable prompt/skill would load in one step.
  const reads = countByCategory(scan, ["read"]);
  if (reads >= opts.minOccurrences * 2) {
    out.push({
      type: "skill-gap",
      title: "Repeated manual file reads — candidate for a reusable skill",
      detail: `${reads} file reads across the session(s) — recurring context-gathering done by hand.`,
      occurrences: reads,
      confidence: 0.65,
      recommendation:
        "Capture this recurring read pattern as a reusable prompt/skill so the agent loads the context in one step instead of re-reading each session.",
    });
  }

  // context-gap: heavy, repeated repo searches signal the agent re-deriving project
  // structure each session — durable context (CONTEXT.md / AGENTS.md) would prevent it.
  const searches = countByCategory(scan, ["search", "list"]);
  if (searches >= opts.minOccurrences * 2) {
    out.push({
      type: "context-gap",
      title: "Repeated repo searches — missing durable context",
      detail: `${searches} searches/listings across the session(s) — structure is being re-discovered each run.`,
      occurrences: searches,
      confidence: 0.65,
      recommendation:
        "Record the project's layout and key entry points in durable context (CONTEXT.md / AGENTS.md) so the agent stops re-searching for them.",
    });
  }

  return out;
}

function deliveryFinding(scan: ScanResult, rawTotal: number): AdviceFinding {
  if (scan.inputType === "copilot-cli") {
    return {
      type: "delivery",
      title: "Wire the Copilot CLI hook so commands flow through tk",
      detail: `${rawTotal} compressible terminal commands ran raw (no tk prefix).`,
      occurrences: rawTotal,
      confidence: 0.9,
      recommendation:
        "Run `tk install --host copilot-cli` to install the rewrite hook, then apply the per-command rewrites below.",
    };
  }
  // vscode (default): the Copilot-CLI hook does not fire here — the shim is the
  // only deterministic delivery path.
  return {
    type: "delivery",
    title: "Install the Token Killer shim so VS Code commands flow through tk",
    detail: `${rawTotal} compressible terminal commands ran raw (no tk prefix). VS Code cannot use the Copilot-CLI hook; the shim is the deterministic path.`,
    occurrences: rawTotal,
    confidence: 0.9,
    recommendation: "Run `tk install` (installs the PATH shim) and restart VS Code.",
  };
}

// Habit-based cost tips — tk's `/chronicle cost tips`. Each tip is grounded in a
// published token-cost best practice (cited in the recommendation), and fires only
// from privacy-safe COUNTS/LENGTHS the habit analyzer collected. `occurrences` is
// set to a naturally-large representative count so a real habit clears the generic
// minOccurrences filter.
function costTipFindings(
  scan: ScanResult,
  habits: HabitStats | undefined,
  opts: AdviceOptions,
): AdviceFinding[] {
  const out: AdviceFinding[] = [];
  if (habits && habits.sessions > 0) {
    // Continuation depth — long agent loops re-send the whole transcript every turn.
    // Published guidance: refresh after ~15–20 turns; by turn 30 you pay ~31× turn 1.
    if (habits.avg_tool_calls_per_session >= 20) {
      out.push({
        type: "cost-tip",
        title: "Long agent loops — break work into shorter sessions",
        detail: `Sessions average ${habits.avg_tool_calls_per_session} tool calls (max ${habits.max_tool_calls_in_session}); every extra turn re-sends the growing transcript.`,
        occurrences: habits.total_tool_calls,
        confidence: 0.7,
        recommendation:
          "Scope each session to one task and start fresh after ~15–20 turns — by turn 30 a conversation costs ~31× what turn 1 did.",
      });
    }
    // Prompt length — over-long prompts are paid on every turn that re-sends them.
    if (habits.long_prompt_count >= opts.minOccurrences) {
      out.push({
        type: "cost-tip",
        title: "Trim oversized prompts",
        detail: `${habits.long_prompt_count} prompt(s) exceeded ${LONG_PROMPT_CHARS} chars (avg ${habits.avg_prompt_chars}, max ${habits.max_prompt_chars}).`,
        occurrences: habits.long_prompt_count,
        confidence: 0.65,
        recommendation:
          "Point at files and name the exact decision instead of pasting context — write as little as required, as much as necessary.",
      });
    }
  }
  // Repeated failures → durable instructions (Copilot CLI `/chronicle improve`).
  for (const o of scan.opportunities) {
    if (o.failure_count >= opts.minOccurrences) {
      out.push({
        type: "cost-tip",
        title: `Repeated failures of \`${o.key}\` — capture the fix once`,
        detail: `\`${o.key}\` failed ${o.failure_count}× — each retry burns tokens re-discovering the same problem.`,
        occurrences: o.failure_count,
        confidence: 0.7,
        recommendation:
          "Record the working invocation / constraint in AGENTS.md (a good instructions file cuts agent token use 50–90%) so the agent stops retrying it.",
      });
    }
  }
  return out;
}

export function buildAdvice(
  scan: ScanResult,
  opts: AdviceOptions = DEFAULT_ADVICE_OPTIONS,
  habits?: HabitStats,
): AdviceFinding[] {
  const findings: AdviceFinding[] = [];
  const raw = compressibleRaw(scan);
  const rawTotal = raw.reduce((sum, o) => sum + o.count, 0);

  // 1) Delivery recommendation (lead).
  if (rawTotal >= opts.minOccurrences) {
    findings.push(deliveryFinding(scan, rawTotal));
  }

  // 2) Per-command rewrite advice (shell-noise).
  for (const o of raw) {
    if (o.count < opts.minOccurrences) continue;
    findings.push({
      type: "shell-noise",
      title: `Prefer \`tk ${o.key}\` over raw \`${o.key}\``,
      detail: `\`${o.key}\` ran ${o.count}× producing ~${o.total_output_tokens} tokens of output.`,
      occurrences: o.count,
      confidence: clampConfidence(0.6 + o.count * 0.04),
      recommendation: `Use \`tk ${o.key}\` — the proxy compresses its output losslessly.`,
    });
  }

  // 3) Direct-tool governance advice (tool-noise).
  for (const o of scan.opportunities) {
    if (o.governed_deny >= opts.minOccurrences) {
      findings.push({
        type: "tool-noise",
        title: `Avoid dependency/lockfile reads via \`${o.key}\``,
        detail: `${o.governed_deny} reads targeted dependency dirs, build output, or lockfiles.`,
        occurrences: o.governed_deny,
        confidence: 0.85,
        recommendation:
          "Read source instead of generated files (direct-tool result compression is not yet delivered; this is governance advice).",
      });
    }
    if (o.governed_suggest >= opts.minOccurrences) {
      findings.push({
        type: "tool-noise",
        title: `Narrow repo-wide searches via \`${o.key}\``,
        detail: `${o.governed_suggest} searches had no narrowing scope.`,
        occurrences: o.governed_suggest,
        confidence: 0.75,
        recommendation: "Scope searches to `src/` or `tests/` and exclude generated dirs.",
      });
    }
  }

  // 4) Workflow-signal gaps (skill-gap / context-gap / storage-discovery).
  findings.push(...workflowGapFindings(scan, opts));

  // 4b) Habit-based cost tips (how the user drives the agent).
  findings.push(...costTipFindings(scan, habits, opts));

  // 5) Long-output hotspots (workflow-friction).
  for (const o of scan.opportunities) {
    if (o.large_output_count >= opts.minOccurrences) {
      findings.push({
        type: "workflow-friction",
        title: `Long-output hotspot: \`${o.key}\``,
        detail: `${o.large_output_count} invocations each produced a large output (max ${o.max_output_chars} chars).`,
        occurrences: o.large_output_count,
        confidence: 0.7,
        recommendation:
          o.kind === "shell"
            ? `Run via \`tk ${o.key}\` to cut output, or add a filter/limit.`
            : "Narrow the request (range/scope) to reduce output volume.",
      });
    }
  }

  return (
    findings
      .filter((f) => f.confidence >= opts.minConfidence && f.occurrences >= opts.minOccurrences)
      // Impact = confidence × occurrences. Delivery always leads on ties.
      .sort((a, b) => {
        if (a.type === "delivery") return -1;
        if (b.type === "delivery") return 1;
        return b.confidence * b.occurrences - a.confidence * a.occurrences;
      })
  );
}

const MARKDOWN_TOP = 5;

// Human-readable advice report (DESIGN §10.3). Top 5 in Markdown; full set in JSON.
export function renderAdviceMarkdown(findings: AdviceFinding[]): string {
  const lines: string[] = [];
  lines.push("## Advice");
  lines.push("");
  lines.push(`Corrections found: ${findings.length}`);
  lines.push("");
  if (findings.length === 0) {
    lines.push("_No high-confidence corrections detected._");
    lines.push("");
    return lines.join("\n");
  }
  for (const f of findings.slice(0, MARKDOWN_TOP)) {
    lines.push(`### ${f.title}`);
    lines.push(`- Type: ${f.type}`);
    lines.push(`- Occurrences: ${f.occurrences}`);
    lines.push(`- Confidence: ${f.confidence}`);
    lines.push(`- ${f.detail}`);
    lines.push(`- → ${f.recommendation}`);
    lines.push("");
  }
  if (findings.length > MARKDOWN_TOP) {
    lines.push(`_+${findings.length - MARKDOWN_TOP} more in \`--json\` output._`);
    lines.push("");
  }
  return lines.join("\n");
}

// The persisted advice file (DESIGN §10.4). Generated marker in the header.
export function renderAdviceFile(findings: AdviceFinding[]): string {
  const lines: string[] = ["# CLI Corrections (generated by tk inspect)", ""];
  if (findings.length === 0) {
    lines.push("_No high-confidence corrections detected._", "");
    return lines.join("\n");
  }
  for (const f of findings) {
    lines.push(`## ${f.title}`);
    lines.push(`- **Type**: ${f.type}`);
    lines.push(`- **Detected**: ${f.occurrences} occurrences`);
    lines.push(`- **Confidence**: ${f.confidence}`);
    lines.push(`- **Correction**: ${f.recommendation}`);
    lines.push("");
  }
  return lines.join("\n");
}
