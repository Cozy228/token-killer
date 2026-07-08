import { describe, expect, test } from "vitest";

import { buildReport, renderJson, renderMarkdown } from "../../../src/inspect/report.js";
import type { ScanResult } from "../../../src/inspect/scan.js";

const scanResult: ScanResult = {
  inputType: "vscode",
  session_inventory: 12,
  transcript_coverage: 4,
  tool_event_count: 3,
  unknown_time_records: 1,
  coverage_errors: 0,
  opportunities: [
    {
      key: "git status",
      kind: "shell",
      category: "execute_adjacent",
      count: 2,
      share: 0.6667,
      total_output_chars: 400,
      total_output_tokens: 100,
      avg_output_chars: 200,
      max_output_chars: 300,
      total_input_chars: 18,
      total_input_tokens: 5,
      max_input_chars: 9,
      success_count: 2,
      failure_count: 0,
      compressible: true,
      governed_deny: 0,
      governed_suggest: 0,
      large_output_count: 0,
    },
  ],
};

const GENERATED = "2026-06-05T00:00:00.000Z";

describe("buildReport", () => {
  test("carries schemaVersion + generatedAt and the scan fields", () => {
    const r = buildReport(scanResult, GENERATED);
    expect(r.schemaVersion).toBe("1");
    expect(r.generatedAt).toBe(GENERATED);
    expect(r.session_inventory).toBe(12);
    expect(r.transcript_coverage).toBe(4);
    expect(r.repo_context).toBeUndefined();
  });

  test("includes repo_context only when supplied", () => {
    const r = buildReport(scanResult, GENERATED, {
      has_git: true,
      has_package_manifest: true,
      has_context_doc: false,
      has_adr_index: false,
      has_skill_or_rules: true,
    });
    expect(r.repo_context?.has_git).toBe(true);
  });
});

describe("renderMarkdown", () => {
  test("shows distinct sessions-found vs readable coverage and the opportunity row", () => {
    const md = renderMarkdown(buildReport(scanResult, GENERATED));
    expect(md).toContain("Sessions found: 12");
    expect(md).toContain("Sessions with readable tool activity: 4");
    expect(md).toContain("`git status`");
    // By-tool row now carries per-tool input + output token totals and a token share.
    expect(md).toContain("≈5 | ≈100 | ≈105");
    expect(md).toContain("100.0%");
  });

  test("leads with action items when advice is present", () => {
    const md = renderMarkdown(
      buildReport(scanResult, GENERATED, undefined, [
        {
          type: "delivery",
          title: "Install the Contexa shim",
          detail: "x",
          occurrences: 6,
          confidence: 0.9,
          recommendation: "Run `ctx install` and restart VS Code.",
        },
      ]),
    );
    // inspect reads analysis-first: the optimization actions ("What to do") close the
    // report, AFTER the "Where your tokens go" analysis they're derived from.
    expect(md).toContain("## What to do");
    expect(md.indexOf("## Where your tokens go")).toBeLessThan(md.indexOf("## What to do"));
    expect(md).toContain("Run `ctx install`");
  });

  test("honestly reports when sessions were found but nothing was readable", () => {
    const md = renderMarkdown(
      buildReport({ ...scanResult, opportunities: [], tool_event_count: 0 }, GENERATED),
    );
    expect(md).toContain("Couldn't read your agent activity");
    expect(md).toContain("0 tool actions");
    expect(md).toContain("--input-type copilot-cli");
    // No data table is rendered.
    expect(md).not.toContain("| count |");
  });

  test("lean scan with events but no opportunities says so, without a scary empty diagnostic", () => {
    const md = renderMarkdown(
      buildReport({ ...scanResult, opportunities: [], tool_event_count: 5 }, GENERATED),
    );
    expect(md).toContain("already lean");
    expect(md).not.toContain("Couldn't read your agent activity");
  });
});

describe("renderJson", () => {
  test("valid JSON with the opportunity columns", () => {
    const parsed = JSON.parse(renderJson(buildReport(scanResult, GENERATED)));
    expect(parsed.schemaVersion).toBe("1");
    expect(parsed.opportunities[0].total_output_chars).toBe(400);
    expect(parsed.opportunities[0].success_count).toBe(2);
  });
});

describe("renderMarkdown — Where your tokens go (measured analysis)", () => {
  test("renders measured totals, per-model + per-session tables, cache hit and context split", () => {
    const r = buildReport(scanResult, GENERATED);
    r.session_tokens = {
      sessions: 3,
      input: 25,
      output: 264,
      cache_read: 60_000,
      cache_write: 20_000,
      reasoning: 159,
      premium_requests: 0.66,
      models: [
        {
          model: "claude-sonnet-4.6",
          requests: 4,
          inputTokens: 53_000,
          outputTokens: 264,
          cacheReadTokens: 60_000,
          cacheWriteTokens: 20_000,
          reasoningTokens: 159,
          cost: 1.3,
        },
      ],
      bySession: [
        {
          id: "a3f9c1bb",
          model: "claude-sonnet-4.6",
          prompt: 60_025,
          output: 264,
          cache_hit: 0.75,
          premium: 0.66,
        },
      ],
      last_context: { system: 5526, conversation: 297, tool_definitions: 8947 },
    };
    const md = renderMarkdown(r);
    expect(md).toContain("## Where your tokens go");
    expect(md).toContain("Measured across 3 session(s)");
    // 60000 / (25 + 60000 + 20000) ≈ 75% cache hit.
    expect(md).toContain("cache hit 75%");
    expect(md).toContain("### By model");
    expect(md).toContain("`claude-sonnet-4.6`");
    expect(md).toContain("### By session");
    expect(md).toContain("`a3f9c1bb`");
    expect(md).toContain("tool defs 9k");
  });

  test("the per-tool breakdown carries category, success rate and flags", () => {
    const md = renderMarkdown(buildReport(scanResult, GENERATED));
    expect(md).toContain("### By tool & command");
    // scanResult's git-status opportunity is compressible and 100% success.
    expect(md).toContain("compressible");
    expect(md).toContain("100%");
  });

  test("optimization points (What to do) render AFTER the analysis", () => {
    const r = buildReport(scanResult, GENERATED, undefined, [
      {
        id: "a1",
        title: "Install the shim",
        recommendation: "Run ctx install",
        severity: "warn",
        confidence: 0.9,
        evidence: "x",
        fix_class: "delivery",
      } as never,
    ]);
    const md = renderMarkdown(r);
    expect(md.indexOf("## Where your tokens go")).toBeLessThan(md.indexOf("## What to do"));
  });
});
