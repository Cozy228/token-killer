import { describe, expect, test } from "vitest";

import { pytestHandler } from "../../../../src/handlers/python/pytest.js";
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

describe("pytest handler", () => {
  test("preserves failures and removes passing progress noise", async () => {
    const raw: RawResult = {
      command: "pytest",
      stdout: [
        ...Array.from({ length: 400 }, (_, index) => `tests/order/test_noise_${index}.py::test_ok PASSED [${index % 100}%]`),
        "=================================== FAILURES ===================================",
        "____________________________ test_duplicate_submit ____________________________",
        "tests/order/test_submit.py::test_duplicate_submit",
        "E   AssertionError: expected 1 call, got 2",
        ">   assert submit_count == 1",
        "src/order/submit.py:82: AssertionError",
        "=========================== short test summary info ===========================",
        "FAILED tests/order/test_submit.py::test_duplicate_submit - AssertionError: expected 1 call, got 2",
        "1 failed, 118 passed, 4 warnings in 3.50s",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await pytestHandler.filter(
      raw,
      { program: "pytest", args: [], original: ["pytest"], displayCommand: "pytest" },
      options,
    );

    expect(result.handler).toBe("pytest");
    expect(result.output).toContain("Pytest failed");
    expect(result.output).toContain("1 failed, 118 passed, 4 warnings");
    expect(result.output).toContain("tests/order/test_submit.py::test_duplicate_submit");
    expect(result.output).toContain("AssertionError");
    expect(result.output).toContain("expected 1 call, got 2");
    expect(result.output).toContain("src/order/submit.py:82");
    expect(result.output).not.toContain("test_noise_399");
    expect(result.exitCode).toBe(1);
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});
