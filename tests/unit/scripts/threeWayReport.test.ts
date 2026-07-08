import { describe, expect, test } from "vitest";

import {
  partitionReportResults,
  renderReport,
  REPORT_MAX_RAW_TOKENS,
  type CaseResult,
} from "../../../scripts/generate-three-way-report.js";

function stats(chars: number) {
  return {
    chars,
    tokens: Math.ceil(chars / 4),
    savingsPct: 0,
  };
}

const longText = Array.from({ length: 80 }, (_, index) => `line ${index + 1}`).join("\n");

const result: CaseResult = {
  name: "long output",
  command: "cat long.txt",
  handler: "read-like",
  rawCmd: "cat long.txt",
  tkCmd: "ctx cat long.txt",
  rtkCmd: "read long.txt",
  exitCode: 0,
  savingsGap: 0,
  raw: stats(longText.length),
  ctx: stats(longText.length),
  rtk: stats(longText.length),
  rawText: longText,
  tkText: longText,
  rtkText: longText,
};

describe("three-way report", () => {
  test("renders complete outputs without omission markers", () => {
    const report = renderReport([result], [], "rtk test", 1, 0);

    expect(report).toContain("line 1");
    expect(report).toContain("line 80");
    expect(report).not.toMatch(/\btruncated\b/);
    expect(report).not.toMatch(/\bmore lines\b/);
    expect(report).not.toMatch(/passthrough .* omitted/);
  });

  test("moves huge raw outputs to stats-only section", () => {
    const huge: CaseResult = {
      ...result,
      name: "tree .",
      raw: { chars: 149128, tokens: REPORT_MAX_RAW_TOKENS + 1, savingsPct: 0 },
      rawText: "x".repeat(1000),
    };
    const { reported, omittedLarge } = partitionReportResults([result, huge]);
    expect(reported).toHaveLength(1);
    expect(omittedLarge).toHaveLength(1);

    const report = renderReport(reported, [], "rtk test", 1, 0, omittedLarge);
    expect(report).toContain("Omitted large outputs");
    expect(report).toContain("tree .");
    expect(report).not.toContain("x".repeat(1000));
  });
});
