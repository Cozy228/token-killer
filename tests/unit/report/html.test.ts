import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { renderReportHtml, type ReportDoc } from "../../../src/report/html.js";
import { writeReport, openInBrowser, emitHtmlReport } from "../../../src/report/open.js";

const GAIN: ReportDoc = {
  kind: "gain",
  title: "Your token savings",
  subtitle: "How much Token Killer saved you.",
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
    expect(html).toContain("window.__TK_REPORT__");
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

  test("embeds inspect findings and the session count", () => {
    const html = renderReportHtml(INSPECT);
    expect(html).toContain("instruction_conflict");
    expect(html).toContain("37"); // sessions analyzed
  });

  test("inspect report offers copy-as-prompt (agent-ready) plus a copy-all", () => {
    const html = renderReportHtml(INSPECT);
    expect(html).toContain("Copy as prompt");
    expect(html).toContain("Copy all as a prompt");
    // The copied payload is an agent instruction, not the human label.
    expect(html).toContain("data-prompt=");
    // The agent is told to snapshot before editing and not to run restore itself.
    expect(html).toContain("tk optimize --backup");
    expect(html).toContain("tk optimize --restore");
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
    home = mkdtempSync(join(tmpdir(), "tk-report-"));
    process.env.TOKEN_KILLER_HOME = join(home, ".token-killer");
  });
  afterEach(() => {
    delete process.env.TOKEN_KILLER_HOME;
    delete process.env.TK_NO_OPEN;
    rmSync(home, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  test("writeReport writes a self-contained file under reports/", () => {
    const path = writeReport(GAIN, 0);
    expect(existsSync(path)).toBe(true);
    expect(path).toContain(join(".token-killer", "reports"));
    expect(path.endsWith(".html")).toBe(true);
    expect(readFileSync(path, "utf8")).toContain("<!doctype html>");
  });

  test("openInBrowser is suppressed under TK_NO_OPEN", () => {
    process.env.TK_NO_OPEN = "1";
    expect(openInBrowser("/tmp/whatever.html")).toBe(false);
  });

  test("emitHtmlReport writes the file and prints its path", () => {
    process.env.TK_NO_OPEN = "1";
    const out = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const path = emitHtmlReport(INSPECT, 0);
    expect(existsSync(path)).toBe(true);
    expect(out).toHaveBeenCalled();
    const dir = join(process.env.TOKEN_KILLER_HOME!, "reports");
    expect(readdirSync(dir).length).toBe(1);
  });
});
