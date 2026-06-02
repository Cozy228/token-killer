import { describe, expect, test } from "vitest";

import { ruffHandler } from "../../../../src/handlers/python/ruff.js";
import type { RawResult, TgOptions } from "../../../../src/types.js";

const options: TgOptions = {
  raw: false,
  stats: false,
  verbose: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: process.cwd(),
};

describe("ruff handler", () => {
  test("groups lint messages by rule and file", async () => {
    const raw: RawResult = {
      command: "ruff check .",
      stdout: [
        ...Array.from({ length: 300 }, (_, index) => `src/noise_${index}.py:1:1: F401 imported but unused`),
        "src/order/submit.py:42:5: F401 `os` imported but unused",
        "src/order/submit.py:88:12: B008 Do not perform function call in argument defaults",
        "Found 302 errors.",
        "[*] 180 fixable with the `--fix` option.",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await ruffHandler.filter(
      raw,
      { program: "ruff", args: ["check", "."], original: ["ruff", "check", "."], displayCommand: "ruff check ." },
      options,
    );

    expect(result.handler).toBe("ruff");
    expect(result.output).toContain("F401");
    expect(result.output).toContain("B008");
    expect(result.output).toContain("src/order/submit.py");
    expect(result.output).toContain("42:5");
    expect(result.output).toContain("fixable");
    expect(result.output).not.toContain("noise_299");
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});
