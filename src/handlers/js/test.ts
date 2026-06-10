import { removeAnsi } from "../../core/ansi.js";
import type { OmissionDeclaration, ParsedCommand } from "../../types.js";
import { defineHandler } from "../define.js";
import { overBudgetLadder } from "../common/budget.js";

// RTK: rtk/src/parser/types.rs::TestResult / TestFailure — the normalized model both
// the JSON (Tier 1) and regex (Tier 2) parsers feed into before formatting.
type TestFailure = { testName: string; errorMessage: string };
type TestResult = {
  passed: number;
  failed: number;
  skipped: number;
  durationMs?: number;
  failures: TestFailure[];
};

// M17: `joined.includes(" test")` is a substring match that fires on
// `pnpm install testlib` (contains " test" inside "testlib"). Fix: check exact
// argv-element equality for the `test` subcommand after a known runner.
// `run test` means args[0]==="run" && args[1]==="test"; bare `test` means args[0]==="test".
// vitest/jest: exact-element check on original (not program-substring) so that
// e.g. `jest-circus` doesn't misroute.
function matchesJsTest(command: ParsedCommand): boolean {
  const isPackageRunnerTest =
    ["npm", "pnpm", "yarn"].includes(command.program) &&
    (command.args[0] === "test" || (command.args[0] === "run" && command.args[1] === "test"));

  return (
    isPackageRunnerTest ||
    command.program === "vitest" ||
    /(?:^|\/)vitest$/.test(command.program) ||
    command.program === "jest" ||
    /(?:^|\/)jest$/.test(command.program) ||
    command.original.some((arg) => arg === "vitest") ||
    command.original.some((arg) => arg === "jest")
  );
}

// RTK: rtk/src/parser/mod.rs::extract_json_object — pull a complete JSON object out of
// output that may carry a non-JSON prefix (pnpm banner, dotenv lines, nested wrappers).
function extractJsonObject(input: string): string | undefined {
  let startPos: number;
  const marker = input.indexOf('"numTotalTests"');
  if (marker !== -1) {
    const before = input.lastIndexOf("{", marker);
    startPos = before === -1 ? 0 : before;
  } else {
    let found: number | undefined;
    let offset = 0;
    for (const line of input.split("\n")) {
      if (line.trim().startsWith("{")) {
        found = offset;
        break;
      }
      offset += line.length + 1;
    }
    if (found === undefined) return undefined;
    startPos = found;
  }

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = startPos; i < input.length; i += 1) {
    const ch = input[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (inString && ch === "\\") {
      escapeNext = true;
    } else if (ch === '"') {
      inString = !inString;
    } else if (!inString && ch === "{") {
      depth += 1;
    } else if (!inString && ch === "}") {
      depth -= 1;
      if (depth === 0) return input.slice(startPos, i + 1);
    }
  }
  return undefined;
}

// RTK: vitest_cmd.rs::VitestParser (Tier 1) — parse vitest/jest JSON reporter output,
// directly or after stripping a prefix, into the normalized TestResult.
function parseTestJson(text: string): TestResult | undefined {
  const candidates = [text.trim(), extractJsonObject(text)].filter((value): value is string =>
    Boolean(value),
  );
  for (const candidate of candidates) {
    if (!candidate.startsWith("{")) continue;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (typeof payload.numTotalTests !== "number") continue;

    const failures: TestFailure[] = [];
    for (const file of (payload.testResults as any[]) ?? []) {
      for (const assertion of (file?.assertionResults as any[]) ?? []) {
        if (assertion?.status === "failed") {
          failures.push({
            testName: String(assertion.fullName ?? ""),
            errorMessage: ((assertion.failureMessages as string[]) ?? []).join("\n"),
          });
        }
      }
    }
    return {
      passed: Number(payload.numPassedTests ?? 0),
      failed: Number(payload.numFailedTests ?? 0),
      skipped: Number(payload.numPendingTests ?? 0),
      failures,
    };
  }
  return undefined;
}

// RTK: vitest_cmd.rs::extract_stats_regex / extract_failures_regex (Tier 2) — recover
// counts and failures from the human reporter when JSON is unavailable. tk also accepts
// the Jest comma-style summary line ("Tests: 3 failed, 215 passed, 218 total"), which
// RTK never sees because it forces --json for jest.
const VITEST_TESTS_RE =
  /Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed(?:\s*\|\s*(\d+)\s+skipped)?/;
const JEST_TESTS_RE = /Tests:\s+(?:(\d+)\s+failed,\s+)?(\d+)\s+passed(?:,\s+(\d+)\s+skipped)?/;
const DURATION_RE = /Duration\s+([\d.]+)(ms|s)/;

function isSummaryLine(line: string): boolean {
  return /^\s*(Tests|Test Files|Duration|Snapshots|Time:)\b/.test(line) || /Tests:/.test(line);
}

function parseTextStats(text: string): TestResult | undefined {
  const clean = removeAnsi(text);
  const vitestMatch = clean.match(VITEST_TESTS_RE);
  const jestMatch = clean.match(JEST_TESTS_RE);
  const countsMatch = vitestMatch ?? jestMatch;
  if (!countsMatch) return undefined;
  const failed = countsMatch[1] ? Number.parseInt(countsMatch[1], 10) : 0;
  const passed = countsMatch[2] ? Number.parseInt(countsMatch[2], 10) : 0;
  // M14: capture skipped count from vitest and jest summary lines.
  const skipped = countsMatch[3] ? Number.parseInt(countsMatch[3], 10) : 0;
  if (passed + failed === 0) return undefined;

  const durationMatch = clean.match(DURATION_RE);
  let durationMs: number | undefined;
  if (durationMatch) {
    const value = Number.parseFloat(durationMatch[1] ?? "0");
    durationMs = durationMatch[2] === "s" ? Math.round(value * 1000) : Math.round(value);
  }

  const lines = clean.split(/\r?\n/);
  const failures: TestFailure[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const header = lines[i]?.match(/^\s*FAIL\s+(.+)$/);
    if (!header || isSummaryLine(lines[i] ?? "")) continue;
    const errorLines: string[] = [];
    let j = i + 1;
    // M14: do NOT break on blank lines within a failure block — jest/vitest often
    // separate "Expected:" from "Received:" with a blank line. Only stop at another
    // FAIL header or a genuine summary line.
    while (j < lines.length) {
      const next = lines[j] ?? "";
      if (/^\s*FAIL\s+/.test(next) || isSummaryLine(next)) break;
      errorLines.push(next.trim());
      j += 1;
    }
    // Trim trailing blank lines from the collected block.
    while (errorLines.length > 0 && errorLines[errorLines.length - 1] === "") {
      errorLines.pop();
    }
    failures.push({ testName: header[1]!.trim(), errorMessage: errorLines.join("\n") });
    i = j - 1;
  }

  return { passed, failed, skipped, durationMs, failures };
}

// "PASS (p) FAIL (f)", then numbered failures with their message lines, then an
// optional Time line. ADR 0001 (intentional divergence from RTK's 5-failure cap):
// a failing test is the highest-value evidence and is NEVER hidden behind a
// `+N more failures`. Below budget every failure is listed in full; over budget
// step 1 keeps every failing test NAME (which test failed — never dropped) and
// drops only the error-message body; step 2 replaces with a failure count.
function formatCompact(result: TestResult): { output: string; omission?: OmissionDeclaration } {
  let summary = `PASS (${result.passed}) FAIL (${result.failed})`;
  if (result.skipped > 0) summary += ` skipped (${result.skipped})`;
  const timeLine = result.durationMs !== undefined ? `\nTime: ${result.durationMs}ms` : "";

  if (result.failures.length === 0) {
    // M14: when there are failures reported in the counts but no failure identities
    // could be extracted (e.g. tier-2 regex got counts but found no FAIL blocks),
    // make it explicit that only counts are known so the agent is not misled.
    if (result.failed > 0) {
      return { output: `${summary} (details unavailable)${timeLine}` };
    }
    return { output: `${summary}${timeLine}` };
  }

  const render = (withMessages: boolean): string => {
    const lines = [summary, ""];
    result.failures.forEach((failure, idx) => {
      lines.push(`${idx + 1}. ${failure.testName}`);
      if (withMessages && failure.errorMessage) {
        for (const line of failure.errorMessage.split("\n")) lines.push(`   ${line}`);
      }
    });
    if (timeLine) lines.push(timeLine);
    return lines.join("\n");
  };

  const ladder = overBudgetLadder({
    full: render(true),
    digest: () => render(false),
    replacement: () => `${summary}\n${result.failures.length} failures (over budget)${timeLine}`,
  });
  return { output: ladder.text, omission: ladder.omission };
}

function formatJsTest(text: string): { output: string; omission?: OmissionDeclaration } {
  // Tier 1: structured JSON (direct or extracted from a prefixed banner).
  const json = parseTestJson(text);
  if (json) {
    const { output, omission } = formatCompact(json);
    return { output: `${output}\n`, omission };
  }

  // Tier 2: regex over the human reporter.
  const stats = parseTextStats(text);
  if (stats) {
    const { output, omission } = formatCompact(stats);
    return { output: `${output}\n`, omission };
  }

  // Tier 3: passthrough — let the shared output limiter cap it.
  return { output: text };
}

export const jsTestHandler = defineHandler({
  name: "js-test",
  traits: { ladder: true },
  programs: ["npm", "pnpm", "yarn", "jest", "vitest"],

  match: matchesJsTest,

  format: (raw, _command, options) => {
    const { output, omission } = formatJsTest(`${raw.stdout}\n${raw.stderr}`);
    return { output, omission };
  },
});
