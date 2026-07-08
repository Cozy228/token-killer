import type { OmissionDeclaration, ParsedCommand } from "../../types.js";
import { defineHandler } from "../define.js";
import { overBudgetLadder } from "../common/budget.js";
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
function filterPytestOutput(output: string): { output: string; omission?: OmissionDeclaration } {
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
      (trimmed.includes(" passed") ||
        trimmed.includes(" failed") ||
        trimmed.includes(" skipped")) &&
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
        else if (trimmed.startsWith("XFAIL") || trimmed.startsWith("XPASS"))
          xfailLines.push(trimmed);
        break;
    }
  }

  if (currentFailure.length > 0) failures.push(currentFailure.join("\n"));

  return buildPytestSummary(summaryLine, failures, xfailLines);
}

function buildPytestSummary(
  summary: string,
  failures: string[],
  xfailLines: string[],
): { output: string; omission?: OmissionDeclaration } {
  const { passed, failed, skipped, xfailed, xpassed } = parseSummaryLine(summary);

  if (passed === 0 && failed === 0 && skipped === 0 && xfailed === 0 && xpassed === 0) {
    return { output: "Pytest: No tests collected" };
  }

  const extrasPresent = skipped > 0 || xfailed > 0 || xpassed > 0 || xfailLines.length > 0;

  if (failed === 0 && passed > 0 && !extrasPresent) {
    return { output: `Pytest: ${passed} passed` };
  }

  let head = `Pytest: ${passed} passed, ${failed} failed`;
  if (skipped > 0) head += `, ${skipped} skipped`;
  if (xfailed > 0) head += `, ${xfailed} xfailed`;
  if (xpassed > 0) head += `, ${xpassed} xpassed`;
  head += `\n${PYTEST_SEPARATOR}\n`;

  // Expected-failure outcomes — every line kept in full (ADR 0001: no MAX_XFAIL
  // cap, no char truncation, no banned `ctx --raw` hint).
  const renderXfail = (): string => {
    if (xfailLines.length === 0) return "";
    let out = "\nExpected-failure outcomes:\n";
    for (const line of xfailLines) out += `  ${line}\n`;
    return out;
  };

  if (failures.length === 0) return { output: `${head}${renderXfail()}`.trim() };

  // Each failing test is evidence and is never hidden behind `+N more failures`.
  // Below budget EVERY failure block is shown in full — every diagnostic line,
  // untruncated (the old `isRelevant` filter + 3-line cap silently dropped stack
  // frames, finding #31). Over budget step 1 keeps every failure header (drops the
  // bodies, declared digest); step 2 replaces with a count.
  const renderFailures = (withBody: boolean): string => {
    let out = "\nFailures:\n";
    failures.forEach((failure, i) => {
      const lines = failure.split("\n");
      const firstLine = lines[0] ?? "";
      const sep = i < failures.length - 1 ? "\n" : "";

      if (firstLine.startsWith("FAILED")) {
        const parts = firstLine.split(" - ");
        const testPath = (parts[0] ?? "").replace(/^FAILED /, "");
        out += `${i + 1}. [FAIL] ${testPath}\n`;
        if (withBody && parts.length > 1) out += `     ${parts.slice(1).join(" - ")}\n`;
        out += sep;
        return;
      }

      if (firstLine.startsWith("___")) {
        const testName = firstLine.replace(/^_+|_+$/g, "").trim();
        out += `${i + 1}. [FAIL] ${testName}\n`;
      }

      if (withBody) {
        for (const line of lines.slice(1)) {
          if (line.trim() !== "") out += `     ${line}\n`;
        }
      }
      out += sep;
    });
    return out;
  };

  const ladder = overBudgetLadder({
    full: `${head}${renderXfail()}${renderFailures(true)}`,
    digest: () => `${head}${renderXfail()}${renderFailures(false)}`,
    replacement: () =>
      `${head}\n${failures.length} failures, ${xfailLines.length} expected-failure outcomes (over budget)`,
  });
  return { output: ladder.text.trim(), omission: ladder.omission };
}

export const pytestHandler = defineHandler({
  name: "pytest",
  traits: { structural: true, ladder: true },
  programs: ["pytest"],

  match: matchesPytest,

  format: (raw, _command, options) => {
    const combined = `${raw.stdout}\n${raw.stderr}`;
    const { output, omission } = filterPytestOutput(combined);

    // C2-pytest fix: pytest exit 2 = collection error (e.g. import/syntax
    // error) and exit 4 = usage error. In both cases the formatter may produce
    // the vacuous "No tests collected" because all counts are zero AND no
    // failure blocks were parsed (ERRORS sections are not captured). Return raw
    // so the traceback is preserved for the agent. Exit 5 = "no tests found"
    // is a normal outcome and does legitimately produce "No tests collected".
    if (
      (raw.exitCode === 2 || raw.exitCode === 4) &&
      output.trimEnd() === "Pytest: No tests collected"
    ) {
      return { output: `${combined.trimEnd()}\n` };
    }

    return { output: `${output}\n`, omission };
  },
});
