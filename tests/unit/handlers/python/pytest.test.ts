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
        ...Array.from(
          { length: 400 },
          (_, index) =>
            `tests/order/test_noise_${index}.py::test_ok PASSED [${index % 100}%]`,
        ),
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
      {
        program: "pytest",
        args: [],
        original: ["pytest"],
        displayCommand: "pytest",
      },
      options,
    );

    expect(result.handler).toBe("pytest");
    expect(result.output).toContain("Pytest failed");
    expect(result.output).toContain("1 failed, 118 passed, 4 warnings");
    expect(result.output).toContain(
      "tests/order/test_submit.py::test_duplicate_submit",
    );
    expect(result.output).toContain("AssertionError");
    expect(result.output).toContain("expected 1 call, got 2");
    expect(result.output).toContain("src/order/submit.py:82");
    expect(result.output).not.toContain("test_noise_399");
    expect(result.exitCode).toBe(1);
    expect(result.savingsPct).toBeGreaterThanOrEqual(80);
  });
});

describe("pytest format variants", () => {
  test("preserves failure details", async () => {
    const raw: RawResult = {
      command: "pytest",
      stdout: [
        "=================================== FAILURES ===================================",
        "________________________ test_submit_order ________________________",
        "tests/test_submit.py::test_submit_order",
        "E   AssertionError: expected 200, got 500",
        ">   assert response.status == 200",
        "tests/test_submit.py:42: AssertionError",
        "=========================== short test summary info ===========================",
        "FAILED tests/test_submit.py::test_submit_order - AssertionError: expected 200, got 500",
        "1 failed, 10 passed in 0.50s",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await pytestHandler.filter(
      raw,
      {
        program: "pytest",
        args: [],
        original: ["pytest"],
        displayCommand: "pytest",
      },
      options,
    );

    expect(result.handler).toBe("pytest");
    expect(result.output).toContain("Pytest failed");
    expect(result.output).toContain(
      "FAILED tests/test_submit.py::test_submit_order",
    );
    expect(result.output).toContain("AssertionError");
    expect(result.output).toContain("expected 200, got 500");
    expect(result.exitCode).toBe(1);
  });

  test("handles all-passing test run", async () => {
    const raw: RawResult = {
      command: "pytest",
      stdout: [
        "tests/test_app.py::test_health PASSED",
        "tests/test_app.py::test_config PASSED",
        "=========================== 2 passed in 0.10s ===========================",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await pytestHandler.filter(
      raw,
      {
        program: "pytest",
        args: [],
        original: ["pytest"],
        displayCommand: "pytest",
      },
      options,
    );

    expect(result.handler).toBe("pytest");
    expect(result.output).toContain("Pytest passed");
    expect(result.output).toContain("2 passed");
    expect(result.exitCode).toBe(0);
  });

  test("handles empty output", async () => {
    const raw: RawResult = {
      command: "pytest",
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await pytestHandler.filter(
      raw,
      {
        program: "pytest",
        args: [],
        original: ["pytest"],
        displayCommand: "pytest",
      },
      options,
    );

    expect(result.handler).toBe("pytest");
    expect(typeof result.output).toBe("string");
  });

  test("handles multiple failures", async () => {
    const raw: RawResult = {
      command: "pytest",
      stdout: [
        "=================================== FAILURES ===================================",
        "________________________ test_submit_duplicate ________________________",
        "tests/test_submit.py::test_submit_duplicate",
        "E   AssertionError: expected 1 call, got 2",
        "________________________ test_login_timeout ________________________",
        "tests/test_auth.py::test_login_timeout",
        "E   TimeoutError: connection timed out",
        "________________________ test_cache_eviction ________________________",
        "tests/test_cache.py::test_cache_eviction",
        "E   AssertionError: cache key not evicted",
        "=========================== short test summary info ===========================",
        "FAILED tests/test_submit.py::test_submit_duplicate - AssertionError: expected 1 call, got 2",
        "FAILED tests/test_auth.py::test_login_timeout - TimeoutError: connection timed out",
        "FAILED tests/test_cache.py::test_cache_eviction - AssertionError: cache key not evicted",
        "3 failed, 20 passed in 1.20s",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await pytestHandler.filter(
      raw,
      {
        program: "pytest",
        args: [],
        original: ["pytest"],
        displayCommand: "pytest",
      },
      options,
    );

    expect(result.handler).toBe("pytest");
    expect(result.output).toContain("test_submit.py::test_submit_duplicate");
    expect(result.output).toContain("test_auth.py::test_login_timeout");
    expect(result.output).toContain("test_cache.py::test_cache_eviction");
  });

  test("preserves no-tests-collected outcome distinctly", async () => {
    const raw: RawResult = {
      command: "pytest -q",
      stdout: "no tests ran in 0.01s\n",
      stderr: "",
      exitCode: 5,
      durationMs: 1,
    };

    const result = await pytestHandler.filter(
      raw,
      {
        program: "pytest",
        args: ["-q"],
        original: ["pytest", "-q"],
        displayCommand: "pytest -q",
      },
      options,
    );

    expect(result.handler).toBe("pytest");
    expect(result.output).toContain("no tests ran");
    expect(result.exitCode).toBe(5);
  });

  test("preserves xfail and xpass summaries", async () => {
    const raw: RawResult = {
      command: "pytest",
      stdout: [
        "tests/test_api.py::test_known_bug XFAIL",
        "tests/test_api.py::test_unexpected_pass XPASS",
        "================= 10 passed, 1 xfailed, 1 xpassed in 1.20s =================",
      ].join("\n"),
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };

    const result = await pytestHandler.filter(
      raw,
      {
        program: "pytest",
        args: [],
        original: ["pytest"],
        displayCommand: "pytest",
      },
      options,
    );

    expect(result.handler).toBe("pytest");
    expect(result.output).toContain("xfailed");
    expect(result.output).toContain("xpassed");
    expect(result.output).toContain("test_unexpected_pass");
  });

  test("preserves quiet-mode failure summaries", async () => {
    const raw: RawResult = {
      command: "pytest -q",
      stdout: [
        "F..s",
        "=================================== FAILURES ===================================",
        "FAILED tests/test_api.py::test_timeout - TimeoutError: request timed out",
        "1 failed, 2 passed, 1 skipped in 0.42s",
      ].join("\n"),
      stderr: "",
      exitCode: 1,
      durationMs: 1,
    };

    const result = await pytestHandler.filter(
      raw,
      {
        program: "pytest",
        args: ["-q"],
        original: ["pytest", "-q"],
        displayCommand: "pytest -q",
      },
      options,
    );

    expect(result.handler).toBe("pytest");
    expect(result.output).toContain("FAILED tests/test_api.py::test_timeout");
    expect(result.output).toContain("1 failed, 2 passed, 1 skipped");
  });
});
