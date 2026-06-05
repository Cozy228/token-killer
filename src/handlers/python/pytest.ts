import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";

// RTK: python/pytest_cmd.rs — CAP_WARNINGS = 10.
const MAX_XFAIL = 10;
const MAX_PYTEST_FAILURES = 10;
// RTK: build_pytest_summary uses a 39-char box-drawing separator under the header.
const PYTEST_SEPARATOR = "═".repeat(39);

function matchesPytest(command: ParsedCommand): boolean {
  return (
    command.program === "pytest" ||
    ((command.program === "python" || command.program === "python3") &&
      command.args[0] === "-m" &&
      command.args[1] === "pytest")
  );
}

// RTK: core/utils.rs::truncate — keep up to max chars, else max-3 chars + "...".
function truncate(text: string, maxLen: number): string {
  const chars = [...text];
  if (chars.length <= maxLen) return text;
  if (maxLen < 3) return "...";
  return `${chars.slice(0, maxLen - 3).join("")}...`;
}

type PytestCounts = {
  passed: number;
  failed: number;
  skipped: number;
  xfailed: number;
  xpassed: number;
};

// RTK: pytest_cmd.rs::parse_summary_line — order matters because "xpassed"/
// "xfailed" contain "passed"/"failed".
function parseSummaryLine(summary: string): PytestCounts {
  const counts: PytestCounts = { passed: 0, failed: 0, skipped: 0, xfailed: 0, xpassed: 0 };
  for (const part of summary.split(",")) {
    const words = part.trim().split(/\s+/);
    for (let i = 1; i < words.length; i += 1) {
      const n = Number.parseInt(words[i - 1]!, 10);
      if (!Number.isFinite(n)) continue;
      const word = words[i]!;
      if (word.includes("xpassed")) counts.xpassed = n;
      else if (word.includes("xfailed")) counts.xfailed = n;
      else if (word.includes("passed")) counts.passed = n;
      else if (word.includes("failed")) counts.failed = n;
      else if (word.includes("skipped")) counts.skipped = n;
    }
  }
  return counts;
}

type ParseState = "header" | "test-progress" | "failures" | "summary";

// RTK: pytest_cmd.rs::filter_pytest_output — a state machine that strips the
// session banner and per-test progress, keeping the summary line, failure blocks,
// and xfail/xpass entries.
function filterPytestOutput(output: string): string {
  let state: ParseState = "header";
  const failures: string[] = [];
  let currentFailure: string[] = [];
  const xfailLines: string[] = [];
  let summaryLine = "";

  for (const rawLine of output.split(/\r?\n/)) {
    const trimmed = rawLine.trim();

    if (trimmed.startsWith("===") && trimmed.includes("test session starts")) {
      state = "header";
      continue;
    } else if (trimmed.startsWith("===") && trimmed.includes("FAILURES")) {
      state = "failures";
      continue;
    } else if (trimmed.startsWith("===") && trimmed.includes("short test summary")) {
      state = "summary";
      if (currentFailure.length > 0) {
        failures.push(currentFailure.join("\n"));
        currentFailure = [];
      }
      continue;
    } else if (
      trimmed.startsWith("===") &&
      (trimmed.includes("passed") || trimmed.includes("failed") || trimmed.includes("skipped"))
    ) {
      summaryLine = trimmed;
      continue;
    } else if (
      // quiet mode (-q): bare summary without === wrapper.
      summaryLine === "" &&
      !trimmed.startsWith("===") &&
      !trimmed.startsWith("FAILED") &&
      !trimmed.startsWith("ERROR") &&
      (trimmed.includes(" passed") || trimmed.includes(" failed") || trimmed.includes(" skipped")) &&
      trimmed.includes(" in ")
    ) {
      summaryLine = trimmed;
      continue;
    }

    switch (state) {
      case "header":
        if (trimmed.startsWith("collected")) state = "test-progress";
        break;
      case "test-progress":
        // Per-test progress lines are dropped (only the summary/failures matter).
        break;
      case "failures":
        if (trimmed.startsWith("___")) {
          if (currentFailure.length > 0) {
            failures.push(currentFailure.join("\n"));
            currentFailure = [];
          }
          currentFailure.push(trimmed);
        } else if (trimmed !== "" && !trimmed.startsWith("===")) {
          currentFailure.push(trimmed);
        }
        break;
      case "summary":
        if (trimmed.startsWith("FAILED") || trimmed.startsWith("ERROR")) failures.push(trimmed);
        else if (trimmed.startsWith("XFAIL") || trimmed.startsWith("XPASS")) xfailLines.push(trimmed);
        break;
    }
  }

  if (currentFailure.length > 0) failures.push(currentFailure.join("\n"));

  return buildPytestSummary(summaryLine, failures, xfailLines);
}

function buildPytestSummary(summary: string, failures: string[], xfailLines: string[]): string {
  const { passed, failed, skipped, xfailed, xpassed } = parseSummaryLine(summary);

  if (passed === 0 && failed === 0 && skipped === 0 && xfailed === 0 && xpassed === 0) {
    return "Pytest: No tests collected";
  }

  const extrasPresent = skipped > 0 || xfailed > 0 || xpassed > 0 || xfailLines.length > 0;

  if (failed === 0 && passed > 0 && !extrasPresent) {
    return `Pytest: ${passed} passed`;
  }

  let result = `Pytest: ${passed} passed, ${failed} failed`;
  if (skipped > 0) result += `, ${skipped} skipped`;
  if (xfailed > 0) result += `, ${xfailed} xfailed`;
  if (xpassed > 0) result += `, ${xpassed} xpassed`;
  result += `\n${PYTEST_SEPARATOR}\n`;

  if (xfailLines.length > 0) {
    result += "\nExpected-failure outcomes:\n";
    for (const line of xfailLines.slice(0, MAX_XFAIL)) {
      result += `  ${truncate(line, 120)}\n`;
    }
    if (xfailLines.length > MAX_XFAIL) {
      result += `  … +${xfailLines.length - MAX_XFAIL} more\n`;
      // RTK: force_tee_tail_hint — tk's recovery channel is `tk --raw`.
      result += "  (run with `tk --raw` to see all expected-failure outcomes)\n";
    }
  }

  if (failures.length === 0) return result.trim();

  result += "\nFailures:\n";

  const shownFailures = failures.slice(0, MAX_PYTEST_FAILURES);
  for (let i = 0; i < shownFailures.length; i += 1) {
    const lines = shownFailures[i]!.split("\n");
    const firstLine = lines[0] ?? "";

    if (firstLine.startsWith("___")) {
      const testName = firstLine.replace(/^_+|_+$/g, "").trim();
      result += `${i + 1}. [FAIL] ${testName}\n`;
    } else if (firstLine.startsWith("FAILED")) {
      const parts = firstLine.split(" - ");
      const testPath = (parts[0] ?? "").replace(/^FAILED /, "");
      result += `${i + 1}. [FAIL] ${testPath}\n`;
      if (parts.length > 1) result += `     ${truncate(parts.slice(1).join(" - "), 100)}\n`;
      if (i < failures.length - 1) result += "\n";
      continue;
    }

    let relevant = 0;
    for (const line of lines.slice(1)) {
      const lower = line.toLowerCase();
      const isRelevant =
        line.trim().startsWith(">") ||
        line.trim().startsWith("E") ||
        lower.includes("assert") ||
        lower.includes("error") ||
        line.includes(".py:");
      if (isRelevant && relevant < 3) {
        result += `     ${truncate(line, 100)}\n`;
        relevant += 1;
      }
    }

    if (i < failures.length - 1) result += "\n";
  }

  if (failures.length > MAX_PYTEST_FAILURES) {
    result += `\n… +${failures.length - MAX_PYTEST_FAILURES} more failures\n`;
    result += "  (run with `tk --raw` to see all failures)\n";
  }

  return result.trim();
}

export const pytestHandler: CommandHandler = {
  name: "pytest",
  programs: ["pytest"],

  matches: matchesPytest,

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(
      this.name,
      raw,
      `${filterPytestOutput(`${raw.stdout}\n${raw.stderr}`)}\n`,
      options,
    );
  },
};
