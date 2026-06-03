import { describe, expect, test } from "vitest";

import { makeFilteredResult } from "../../../src/handlers/base.js";
import type { RawResult, TgOptions } from "../../../src/types.js";

const options: TgOptions = {
  raw: false,
  stats: false,
  verbose: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: process.cwd(),
};

function raw(stdout: string): RawResult {
  return {
    command: "custom",
    stdout,
    stderr: "",
    exitCode: 0,
    durationMs: 1,
  };
}

describe("filtered output quality gate", () => {
  test("passes raw output through when a filter inflates small output", async () => {
    const result = await makeFilteredResult(
      "custom",
      raw("a.txt\nb.ts\n"),
      ".\n├─ a.txt\n├─ b.ts\n",
      options,
    );

    expect(result.output).toBe("a.txt\nb.ts\n");
    expect(result.qualityStatus).toBe("inflated");
    expect(result.savedTokens).toBe(0);
    expect(result.savingsPct).toBe(0);
  });

  test("passes raw output through when a filter erases non-empty output", async () => {
    const result = await makeFilteredResult(
      "custom",
      raw("important line\n"),
      "\n",
      options,
    );

    expect(result.output).toBe("important line\n");
    expect(result.qualityStatus).toBe("empty_output");
  });

  test("keeps compact output when it is smaller and non-empty", async () => {
    const result = await makeFilteredResult(
      "custom",
      raw("first line\nsecond line\nthird line\n"),
      "3 lines summarized\n",
      options,
    );

    expect(result.output).toBe("3 lines summarized\n");
    expect(result.qualityStatus).toBe("passed");
    expect(result.savedTokens).toBeGreaterThan(0);
  });
});
