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
  test("shows distinct inventory vs coverage and the opportunity row", () => {
    const md = renderMarkdown(buildReport(scanResult, GENERATED));
    expect(md).toContain("Session inventory: 12");
    expect(md).toContain("Transcript coverage (files with tool events): 4");
    expect(md).toContain("`git status`");
    expect(md).toContain("| 2 | 66.7% |");
  });

  test("empty opportunities → friendly message, no table", () => {
    const md = renderMarkdown(buildReport({ ...scanResult, opportunities: [], tool_event_count: 0 }, GENERATED));
    expect(md).toContain("No tool events found");
    expect(md).not.toContain("| count |");
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
