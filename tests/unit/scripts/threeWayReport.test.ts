import { describe, expect, test } from "vitest";

import { renderReport, type CaseResult } from "../../../scripts/generate-three-way-report.js";

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
  tgCmd: "tg cat long.txt",
  rtkCmd: "read long.txt",
  exitCode: 0,
  savingsGap: 0,
  raw: stats(longText.length),
  tg: stats(longText.length),
  rtk: stats(longText.length),
  rawText: longText,
  tgText: longText,
  rtkText: longText,
};

describe("three-way report", () => {
  test("renders complete outputs without omission markers", () => {
    const report = renderReport([result], [], "rtk test");

    expect(report).toContain("line 1");
    expect(report).toContain("line 80");
    expect(report).not.toMatch(/\bomitted\b/);
    expect(report).not.toMatch(/\btruncated\b/);
    expect(report).not.toMatch(/\bmore lines\b/);
    expect(report).not.toMatch(/passthrough .* omitted/);
  });
});
