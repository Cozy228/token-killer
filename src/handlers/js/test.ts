import { executeCommand } from "../../executor.js";
import { removeAnsi } from "../../core/ansi.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";

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

function matchesJsTest(command: ParsedCommand): boolean {
  const joined = command.original.join(" ");
  return (
    (["npm", "pnpm", "yarn"].includes(command.program) &&
      (command.args[0] === "test" || joined.includes(" run test") || joined.includes(" test"))) ||
    command.program.includes("vitest") ||
    command.program.includes("jest") ||
    command.original.includes("vitest") ||
    command.original.includes("jest")
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
  const candidates = [text.trim(), extractJsonObject(text)].filter(
    (value): value is string => Boolean(value),
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
const VITEST_TESTS_RE = /Tests\s+(?:(\d+)\s+failed\s*\|\s*)?(\d+)\s+passed/;
const JEST_TESTS_RE = /Tests:\s+(?:(\d+)\s+failed,\s+)?(\d+)\s+passed/;
const DURATION_RE = /Duration\s+([\d.]+)(ms|s)/;

function isSummaryLine(line: string): boolean {
  return /^\s*(Tests|Test Files|Duration|Snapshots|Time:)\b/.test(line) || /Tests:/.test(line);
}

function parseTextStats(text: string): TestResult | undefined {
  const clean = removeAnsi(text);
  const countsMatch = clean.match(VITEST_TESTS_RE) ?? clean.match(JEST_TESTS_RE);
  if (!countsMatch) return undefined;
  const failed = countsMatch[1] ? Number.parseInt(countsMatch[1], 10) : 0;
  const passed = countsMatch[2] ? Number.parseInt(countsMatch[2], 10) : 0;
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
    while (j < lines.length) {
      const next = lines[j] ?? "";
      if (next.trim() === "" || /^\s*FAIL\s+/.test(next) || isSummaryLine(next)) break;
      errorLines.push(next.trim());
      j += 1;
    }
    failures.push({ testName: header[1]!.trim(), errorMessage: errorLines.join("\n") });
    i = j - 1;
  }

  return { passed, failed, skipped: 0, durationMs, failures };
}

// RTK: rtk/src/parser/formatter.rs::TestResult::format_compact — "PASS (p) FAIL (f)",
// then up to 5 numbered failures with their message lines, then an optional Time line.
function formatCompact(result: TestResult): string {
  let summary = `PASS (${result.passed}) FAIL (${result.failed})`;
  if (result.skipped > 0) summary += ` skipped (${result.skipped})`;
  const lines = [summary];

  if (result.failures.length > 0) {
    lines.push("");
    result.failures.slice(0, 5).forEach((failure, idx) => {
      lines.push(`${idx + 1}. ${failure.testName}`);
      if (failure.errorMessage) {
        for (const line of failure.errorMessage.split("\n")) lines.push(`   ${line}`);
      }
    });
    if (result.failures.length > 5) {
      lines.push(`\n... +${result.failures.length - 5} more failures`);
    }
  }

  if (result.durationMs !== undefined) lines.push(`\nTime: ${result.durationMs}ms`);
  return lines.join("\n");
}

function formatJsTest(text: string): string {
  // Tier 1: structured JSON (direct or extracted from a prefixed banner).
  const json = parseTestJson(text);
  if (json) return `${formatCompact(json)}\n`;

  // Tier 2: regex over the human reporter.
  const stats = parseTextStats(text);
  if (stats) return `${formatCompact(stats)}\n`;

  // Tier 3: passthrough — let the shared output limiter cap it.
  return text;
}

export const jsTestHandler: CommandHandler = {
  name: "js-test",
  programs: ["npm", "pnpm", "yarn", "jest", "vitest"],

  matches: matchesJsTest,

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatJsTest(`${raw.stdout}\n${raw.stderr}`), options);
  },
};
