import { describe, expect, test } from "vitest";

import { makeFilteredResult } from "../../../src/handlers/base.js";
import type { RawResult, TkOptions } from "../../../src/types.js";

const options: TkOptions = {
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
      { name: "custom" },
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
      { name: "custom" },
      raw("important line\n"),
      "\n",
      options,
    );

    expect(result.output).toBe("important line\n");
    expect(result.qualityStatus).toBe("empty_output");
  });

  test("passes raw output through when a filter omits content", async () => {
    const result = await makeFilteredResult(
      { name: "custom" },
      raw("line one\nline two\nline three\n"),
      "line one\n+2 more matches\n",
      options,
    );

    expect(result.output).toBe("line one\nline two\nline three\n");
    expect(result.qualityStatus).toBe("inflated");
  });

  test("passes raw output through when a filter reports truncated content", async () => {
    const result = await makeFilteredResult(
      { name: "custom" },
      raw("diff line one\ndiff line two\n"),
      "diff line one\n... (more changes truncated)\n",
      options,
    );

    expect(result.output).toBe("diff line one\ndiff line two\n");
    expect(result.qualityStatus).toBe("inflated");
  });

  test("does not treat omission words inside real content as truncation", async () => {
    const output = [
      "diff --git a/src/example.ts b/src/example.ts",
      '+const message = "not shown is just text";',
      '+const label = "Hidden: also just text";',
      "",
    ].join("\n");

    const result = await makeFilteredResult({ name: "custom" }, raw(output), output, options);

    expect(result.output).toBe(output);
    expect(result.qualityStatus).toBe("passed");
  });

  test("keeps compact output when it is smaller and non-empty", async () => {
    const result = await makeFilteredResult(
      { name: "custom" },
      raw("first line\nsecond line\nthird line\n"),
      "3 lines summarized\n",
      options,
    );

    expect(result.output).toBe("3 lines summarized\n");
    expect(result.qualityStatus).toBe("passed");
    expect(result.savedTokens).toBeGreaterThan(0);
  });

  // A Tier-3 passthrough that rebuilds output as `${stdout}\n${stderr}` appends a
  // newline when stderr is empty. On a tiny output that 1-char growth used to trip
  // the zero-tolerance budget and flag a false `inflated` row. Edge whitespace
  // carries no dropped content, so the gate must treat it as a clean passthrough.
  test("does not flag inflation when output only adds edge whitespace", async () => {
    const result = await makeFilteredResult(
      { name: "custom" },
      raw("vitest/4.1.8 darwin-arm64 node-v22.22.2\n"),
      "vitest/4.1.8 darwin-arm64 node-v22.22.2\n\n",
      options,
    );

    expect(result.qualityStatus).toBe("passed");
  });
});
