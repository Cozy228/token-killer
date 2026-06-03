import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { buildReport } from "../../../src/core/report.js";
import { recordHistory } from "../../../src/core/history.js";
import type { FilteredResult, RawResult, TgOptions } from "../../../src/types.js";

function options(cwd: string): TgOptions {
  return {
    raw: false,
    stats: false,
    verbose: false,
    maxLines: 120,
    maxChars: 12000,
    saveRaw: false,
    cwd,
    reportFormat: "text",
  };
}

const raw: RawResult = {
  command: "ls",
  stdout: "a.txt\nb.ts\n",
  stderr: "",
  exitCode: 0,
  durationMs: 1,
};

const filtered: FilteredResult = {
  handler: "list-like",
  output: "a.txt\nb.ts\n",
  rawChars: 10,
  outputChars: 10,
  rawTokens: 3,
  outputTokens: 3,
  savedTokens: 0,
  savingsPct: 0,
  exitCode: 0,
  qualityStatus: "inflated",
};

describe("report quality metrics", () => {
  test("records and reports filter quality status counts", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-report-quality-"));
    try {
      await recordHistory(raw, filtered, options(dir));

      const report = await buildReport(options(dir));

      expect(report).toContain("Quality:");
      expect(report).toContain("- inflated: 1");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
