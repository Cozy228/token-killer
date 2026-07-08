import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renderReportHtml, type ReportDoc } from "../../../src/report/html.js";
import { promptModel } from "../../../src/report/promptModel.js";
import { writeReport, openInBrowser, emitHtmlReport } from "../../../src/report/open.js";

const GAIN: ReportDoc = {
  kind: "gain",
  title: "Your token savings",
  subtitle: "How much Contexa saved you.",
  generatedAt: "2026-06-06T00:00:00.000Z",
  data: {
    scope: "user",
    estimated_savings_usd: 17.83,
    estimated_savings_ai_credits: 1783,
    price_per_mtok: 3,
    cross_reference: {
      model: "gpt-5.5",
      estimated_savings_usd: 29.72,
      estimated_savings_ai_credits: 2972,
      price_per_mtok: 5,
    },
    measured_command_savings: {
      estimate_kind: "measured",
      commands: 10,
      raw_tokens: 1000,
      output_tokens: 300,
      saved_tokens: 700,
      savings_pct: 70,
      avg_savings_per_command: 70,
      by_handler: [{ handler: "git-log", raw: 1000, saved: 700, pct: 70, count: 10 }],
      quality_status_counts: { passed: 10 },
    },
    optimizer_deltas: { estimate_kind: "measured", surfaces: [] },
    governance_opportunities: {
      denied_large_reads: 1,
      suggested_broad_searches: 0,
      denied_large_prompts: 0,
      suggested_large_prompts: 0,
      avoided_tokens_estimate: 5000,
    },
    quality_guardrails: {
      commands: 10,
      fallback_rate: 0,
      failure_rate: 0,
      findings_reverted: 0,
      raw_reopen_rate: "n/a",
    },
  },
};

const INSPECT: ReportDoc = {
  kind: "inspect",
  title: "Context cleanup report",
  subtitle: "Where your setup wastes tokens.",
  generatedAt: "2026-06-06T00:00:00.000Z",
  data: {
    scope: "project",
    files_scanned: 14,
    sessions_analyzed: 37,
    findings: [
      {
        severity: "error",
        type: "instruction_conflict",
        file: "AGENTS.md",
        start_line: 4,
        evidence: "two rules clash",
        recommendation: "pick one",
        fix_class: "suggested_diff",
      },
    ],
  },
};

describe("renderReportHtml", () => {
  test("produces one self-contained HTML doc with no external resources", () => {
    const html = renderReportHtml(GAIN);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("window.__CTX_REPORT__");
    // No network: no external src/href to http(s) or CDN.
    expect(html).not.toMatch(/<(script|link)[^>]+(src|href)=["']https?:/i);
  });

  test("embeds the gain numbers, AI Credits headline, and GPT-5.5 cross-ref", () => {
    const html = renderReportHtml(GAIN);
    expect(html).toContain("700"); // saved tokens (measured)
    expect(html).toContain("17.83"); // usd estimate (secondary)
    expect(html).toContain("AI Credits"); // headline value unit (render JS)
    expect(html).toContain("gpt-5.5"); // well-known cross-reference (embedded JSON)
    expect(html).toContain("2972"); // gpt-5.5 credits (raw, formatted in-browser)
  });

  test("wires the narrative sections and round-trips the trend time series", () => {
    // The section renderers (problem / difference / trend) live in the embedded
    // SCRIPT, so their labels are always present in the doc — assert they are wired.
    const html = renderReportHtml(GAIN);
    expect(html).toContain("The problem"); // merged problem + before/after section
    expect(html).toContain("Redundant noise"); // stat tile (raw repeat removed)
    expect(html).toContain("See the difference"); // before/after bars, now folded in
    expect(html).toContain("Real-world savings"); // daily/weekly/monthly trend
    // Data-conditional: the base fixture has no time series, so no bucket keys leak
    // into the embedded JSON (the renderer hides the section at runtime).
    expect(html).not.toContain("2026-W23");

    const withTrend: ReportDoc = {
      ...GAIN,
      data: {
        ...(GAIN.data as Record<string, unknown>),
        timeseries: {
          daily: [{ key: "2026-06-06", commands: 10, raw: 1000, saved: 700, pct: 70 }],
          weekly: [{ key: "2026-W23", commands: 10, raw: 1000, saved: 700, pct: 70 }],
          monthly: [{ key: "2026-06", commands: 10, raw: 1000, saved: 700, pct: 70 }],
        },
      },
    };
    // Provided buckets reach the embedded data, so the runtime renderer can draw them.
    expect(renderReportHtml(withTrend)).toContain("2026-W23");
  });

  test("embeds inspect findings and the session count", () => {
    const html = renderReportHtml(INSPECT);
    expect(html).toContain("instruction_conflict");
    expect(html).toContain("37"); // sessions analyzed
  });

  test("every finding card carries a prominent Saves field (grounded number or 'varies')", () => {
    const withSaving: ReportDoc = {
      ...INSPECT,
      data: {
        ...(INSPECT.data as Record<string, unknown>),
        findings: [
          {
            severity: "warn",
            type: "skill_count_bloat",
            evidence: "~2248 tokens",
            recommendation: "prune",
            fix_class: "advisory",
            est_savings_tokens: 2248,
          },
          {
            severity: "info",
            type: "skill_invocation_policy",
            evidence: "missing policy",
            recommendation: "add",
            fix_class: "safe_mechanical",
          },
        ],
      },
    };
    const html = renderReportHtml(withSaving);
    expect(html).toContain("savesField"); // the per-card Saves renderer is wired
    expect(html).toContain('"est_savings_tokens":2248'); // grounded saving round-trips
    // a fix with no measurable saving is NOT fabricated as 0 in the data
    expect(html).not.toContain('"est_savings_tokens":0');
  });

  test("keeps three tiers (no problems dropped) — 'Lower impact' replaces 'Minor'", () => {
    const html = renderReportHtml(INSPECT);
    expect(html).toContain("Fix now");
    expect(html).toContain("Worth fixing");
    expect(html).toContain("Lower impact"); // the old info tier, kept + renamed
    expect(html).not.toContain(">Minor<");
    // The per-type severity promotion (de-split, no drop) is wired in the SCRIPT.
    expect(html).toContain("consolidateFindings");
  });

  test("wires the measured token-analysis section labels (rendered client-side)", () => {
    // renderTokenAnalysis lives in the embedded SCRIPT, so its section labels are
    // always present in the doc — assert the analysis-first layout is wired.
    const html = renderReportHtml(INSPECT);
    expect(html).toContain("Where your tokens go");
    expect(html).toContain("By model");
    expect(html).toContain("By session");
    expect(html).toContain("By tool");
    expect(html).toContain("Standing context cost");
    expect(html).toContain("What you can improve");
  });

  test("round-trips measured session_tokens + per-tool opportunities into the embedded data", () => {
    const withTokens: ReportDoc = {
      ...INSPECT,
      data: {
        ...(INSPECT.data as Record<string, unknown>),
        tool_event_count: 312,
        session_tokens: {
          sessions: 18,
          input: 142_000,
          output: 88_000,
          cache_read: 1_840_000,
          cache_write: 412_000,
          reasoning: 31_000,
          premium_requests: 14.2,
          models: [
            {
              model: "claude-sonnet-4.6",
              requests: 12,
              inputTokens: 118_000,
              outputTokens: 71_000,
              cacheReadTokens: 1_620_000,
              cacheWriteTokens: 338_000,
              reasoningTokens: 27_000,
              cost: 12.8,
            },
          ],
          bySession: [
            {
              id: "a3f9c1bb",
              model: "claude-sonnet-4.6",
              prompt: 684_000,
              output: 21_000,
              cache_hit: 0.81,
              premium: 4.1,
            },
          ],
          last_context: { system: 5526, conversation: 12_400, tool_definitions: 8947 },
        },
        opportunities: [
          {
            key: "cat",
            category: "execute_adjacent",
            count: 312,
            share: 0.41,
            total_output_tokens: 41_000,
            avg_output_chars: 132,
            max_output_chars: 9800,
            total_input_chars: 8,
            max_input_chars: 8,
            success_count: 312,
            failure_count: 0,
            compressible: true,
            governed_deny: 0,
            governed_suggest: 0,
            large_output_count: 4,
            kind: "shell",
          },
        ],
      },
    };
    const html = renderReportHtml(withTokens);
    expect(html).toContain("claude-sonnet-4.6"); // per-model row data
    expect(html).toContain("a3f9c1bb"); // per-session row id
    expect(html).toContain("14.2"); // premium requests
    expect(html).toContain('"compressible":true'); // per-tool flag data round-trips
  });

  test("inspect report offers copy-as-prompt (agent-ready) plus a copy-all", () => {
    const html = renderReportHtml(INSPECT);
    expect(html).toContain("Copy as prompt");
    expect(html).toContain("Copy all as a prompt");
    // The copied payload is an agent instruction, not the human label.
    expect(html).toContain("data-prompt=");
    // The agent is told to snapshot before editing and not to run restore itself.
    expect(html).toContain("ctx optimize --backup");
    expect(html).toContain("ctx optimize --restore");
  });

  test("the report SCRIPT carries the prompt model so prompts build client-side", () => {
    const html = renderReportHtml(INSPECT);
    // The injected model (promptModel.ts) ships its grounded, real-host advice into
    // the page — proof the per-category registry reaches the browser, not just Node.
    expect(html).toContain("disable-model-invocation: true"); // real skill frontmatter key
    expect(html).toContain("chat.tools.compressOutput.enabled"); // real VS Code setting key
    expect(html).toContain(".github/instructions/"); // real scoped-instructions target
    expect(html).toContain("function buildPrompt"); // build machinery present
  });

  // The "Copy as prompt" payload is built in the browser, so its FILLED text never
  // appears in the static HTML. promptModel exports the exact same source the page
  // runs, so these assert the real per-category output (issue #58).
  test("a file-edit finding names its concrete file/line + category-specific how", () => {
    const p = promptModel.buildPrompt({
      type: "instruction_conflict",
      file: "AGENTS.md",
      start_line: 4,
      evidence: "two rules clash",
      recommendation: "pick one",
    });
    // task names the concrete target, not a generic skeleton...
    expect(p).toContain("Resolve the contradictory instructions detected at AGENTS.md (line 4)");
    // ...carries a category-specific How block...
    expect(p).toContain("  How:");
    expect(p).toContain("delete the losing side");
    // ...keeps the reversible-edit framing for file findings...
    expect(p).toContain("ctx optimize --backup AGENTS.md");
    expect(p).toContain("ctx optimize --restore");
    // ...and drops the old generic labels.
    expect(p).not.toContain("Change to make:");
    expect(p).not.toContain("Problem:");
  });

  test("a finding with no start_line collapses the (line ) artifact cleanly", () => {
    const p = promptModel.buildPrompt({
      type: "skill_description_bloat",
      file: "skills/foo/SKILL.md",
      surface: "skill",
    });
    expect(p).toContain(
      "Tighten the description of the skill defined in skills/foo/SKILL.md to a concise trigger.",
    );
    expect(p).not.toContain("(line )");
  });

  test("the skill invocation-policy prompt names the real frontmatter flags", () => {
    const p = promptModel.buildPrompt({
      type: "skill_invocation_policy",
      file: ".claude/skills/deploy/SKILL.md",
      start_line: 1,
      surface: "skill",
    });
    expect(p).toContain("disable-model-invocation: true");
    expect(p).toContain("user-invocable: false");
    expect(p).toContain("allowed-tools");
    // The space before a leading-dot path must survive the punctuation cleanup.
    expect(p).toContain("on the skill at .claude/skills/deploy/SKILL.md (line 1).");
    expect(p).not.toContain("at.claude");
  });

  test("a runtime/setup finding is where-based with no backup/restore dance", () => {
    const p = promptModel.buildPrompt({
      type: "mcp_bloat",
      where: "your MCP server config",
      evidence: "5 servers configured",
      recommendation: "disable unused",
    });
    expect(p).toContain("Prune the MCP servers configured at: your MCP server config");
    expect(p).toContain("prefer it over the equivalent MCP server");
    expect(p).not.toContain("ctx optimize --backup");
    expect(p).not.toContain("Step 1");
  });

  test("an unknown finding type falls back to its own recommendation (no empty prompt)", () => {
    const p = promptModel.buildPrompt({
      type: "some_future_type",
      where: "somewhere",
      recommendation: "do the thing",
    });
    expect(p).toContain("Do this: do the thing");
  });

  test("every closed-set finding type has a template (issue #58 coverage)", () => {
    const CONTEXT_TYPES = [
      "always_on_bloat",
      "conditional_rule_in_always_on",
      "path_instruction_overbreadth",
      "task_prompt_in_instruction",
      "prompt_metadata_gap",
      "agent_overbreadth",
      "chat_mode_bloat",
      "skill_invocation_policy",
      "skill_entrypoint_bloat",
      "skill_description_bloat",
      "skill_count_bloat",
      "output_verbosity_unset",
      "instruction_duplicate",
      "instruction_conflict",
      "copilot_review_truncation",
      "cacheability_churn",
      "malformed_frontmatter",
      "discovery_truncated",
      "vscode_compress_disabled",
    ];
    const RUNTIME_TYPES = [
      "uncompressed_commands",
      "orientation_cost",
      "repeated_failures",
      "dependency_reads",
      "long_agent_loops",
      "oversized_prompts",
      "mcp_bloat",
    ];
    for (const t of [...CONTEXT_TYPES, ...RUNTIME_TYPES]) {
      expect(promptModel.PROMPT_TPL[t], `missing template for ${t}`).toBeTruthy();
      expect(promptModel.PROMPT_TPL[t].task.length).toBeGreaterThan(0);
      // The human-facing PROBLEM label must key off the SAME real f.type — the old
      // map had keys (duplicate_instructions, …) that matched no finding.
      expect(promptModel.PROBLEM[t], `missing PROBLEM label for ${t}`).toBeTruthy();
    }
  });

  test("buildAllPrompt composes one paste with per-item tasks", () => {
    const all = promptModel.buildAllPrompt([
      { type: "instruction_conflict", file: "AGENTS.md", start_line: 4 },
      { type: "mcp_bloat", where: "your MCP server config" },
    ]);
    expect(all).toContain("Resolve the contradictory instructions detected at AGENTS.md (line 4)");
    expect(all).toContain("Prune the MCP servers configured at: your MCP server config");
    // A file is present → the snapshot framing leads.
    expect(all).toContain("ctx optimize --backup AGENTS.md");
  });

  test("escapes a </script> breakout attempt in the data", () => {
    const evil: ReportDoc = {
      ...INSPECT,
      data: {
        ...(INSPECT.data as object),
        findings: [
          {
            severity: "info",
            type: "x",
            evidence: "</script><img src=x onerror=alert(1)>",
            recommendation: "r",
            fix_class: "advisory",
          },
        ],
      },
    };
    const html = renderReportHtml(evil);
    // The raw closing tag must not appear inside the injected JSON blob.
    expect(html).not.toContain("</script><img");
    expect(html).toContain("\\u003c/script>");
  });

  test("escapes the title", () => {
    const html = renderReportHtml({ ...GAIN, title: '<b>x</b>"q"' });
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
  });
});

describe("writeReport + openInBrowser", () => {
  let home: string;
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), "ctx-report-"));
    process.env.CONTEXA_HOME = join(home, ".contexa");
  });
  afterEach(() => {
    delete process.env.CONTEXA_HOME;
    delete process.env.CTX_NO_OPEN;
    rmSync(home, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test("writeReport writes a self-contained file under reports/", () => {
    const path = writeReport(GAIN, 0);
    expect(existsSync(path)).toBe(true);
    expect(path).toContain(join(".contexa", "reports"));
    expect(path.endsWith(".html")).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("<!doctype html>");
  });

  test("openInBrowser is suppressed under CTX_NO_OPEN", () => {
    process.env.CTX_NO_OPEN = "1";
    expect(openInBrowser("/tmp/whatever.html")).toBe(false);
  });

  test("emitHtmlReport writes the file and prints its path", () => {
    process.env.CTX_NO_OPEN = "1";
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const path = emitHtmlReport(INSPECT, 0);
    expect(existsSync(path)).toBe(true);
    expect(out).toHaveBeenCalled();
    const dir = join(process.env.CONTEXA_HOME!, "reports");
    expect(readdirSync(dir).length).toBe(1);
  });
});
