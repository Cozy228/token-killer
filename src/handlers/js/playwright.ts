import { executeCommand } from "../../executor.js";
import { removeAnsi } from "../../core/ansi.js";
import type { CommandHandler, OmissionDeclaration, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";
import { overBudgetLadder } from "../common/budget.js";

// RTK: js/playwright_cmd.rs — filters Playwright E2E test output to show only failures.
// Tier 1 parses the JSON reporter (suites → specs → tests → results); Tier 2 falls back
// to regex over the human reporter; Tier 3 is passthrough. The normalized TestResult is
// rendered with the shared compact formatter (parser/formatter.rs::TestResult).

// RTK: parser/types.rs::TestResult / TestFailure — the normalized model both the JSON
// (Tier 1) and regex (Tier 2) parsers feed into before formatting.
type TestFailure = { testName: string; errorMessage: string };
type TestResult = {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  durationMs?: number;
  failures: TestFailure[];
};

// RTK: playwright_cmd.rs::PlaywrightSuite / PlaywrightSpec / PlaywrightExecution /
// PlaywrightAttempt / PlaywrightError — the shape of the real Playwright JSON reporter.
type PwError = { message?: string };
type PwAttempt = { status?: string; errors?: PwError[] };
type PwExecution = { status?: string; results?: PwAttempt[] };
type PwSpec = { title?: string; ok?: boolean; tests?: PwExecution[] };
type PwSuite = {
  title?: string;
  file?: string;
  specs?: PwSpec[];
  suites?: PwSuite[];
};
type PwJson = {
  stats?: { expected?: number; unexpected?: number; skipped?: number; duration?: number };
  suites?: PwSuite[];
};

// RTK: playwright_cmd.rs::collect_test_results — walk suites/nested-suites, count every
// spec into `total`, and for each failing spec (ok === false) record the first failed or
// timedOut error message from the first "unexpected" execution (fallback "Test failed").
function collectTestResults(suites: PwSuite[], acc: { total: number; failures: TestFailure[] }): void {
  for (const suite of suites) {
    // RTK derives file_path = suite.file ?? suite.title for the verbose formatter; the
    // compact formatter used here never prints it, so we only retain test_name + message.
    for (const spec of suite.specs ?? []) {
      acc.total += 1;
      if (spec.ok === false) {
        const unexpected = (spec.tests ?? []).find((t) => t.status === "unexpected");
        const failedResult = (unexpected?.results ?? []).find(
          (r) => r.status === "failed" || r.status === "timedOut",
        );
        const errorMsg = failedResult?.errors?.[0]?.message ?? "Test failed";
        acc.failures.push({ testName: spec.title ?? "", errorMessage: errorMsg });
      }
    }
    collectTestResults(suite.suites ?? [], acc);
  }
}

// RTK: playwright_cmd.rs::PlaywrightParser::parse (Tier 1) — try JSON first. `passed`/
// `failed`/`skipped` come straight from `stats`; `duration` is a float truncated to u64.
function parsePlaywrightJson(text: string): TestResult | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) return undefined;
  let json: PwJson;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  // serde requires a `stats` object with expected/unexpected/skipped; without it the
  // Rust deserialize fails and we drop to the regex tier.
  const stats = json.stats;
  if (
    !stats ||
    typeof stats.expected !== "number" ||
    typeof stats.unexpected !== "number" ||
    typeof stats.skipped !== "number"
  ) {
    return undefined;
  }

  const acc = { total: 0, failures: [] as TestFailure[] };
  collectTestResults(json.suites ?? [], acc);

  return {
    total: acc.total,
    passed: stats.expected,
    failed: stats.unexpected,
    skipped: stats.skipped,
    durationMs: typeof stats.duration === "number" ? Math.trunc(stats.duration) : 0,
    failures: acc.failures,
  };
}

// RTK: playwright_cmd.rs::extract_playwright_regex (Tier 2) — recover counts from the
// human reporter when JSON is unavailable. Matches "<n> passed|failed|flaky|skipped" and
// "(<value><unit>)" duration; returns undefined when no counts are found (→ Tier 3).
const SUMMARY_RE = /(\d+)\s+(passed|failed|flaky|skipped)/g;
const DURATION_RE = /\((\d+(?:\.\d+)?)(ms|s|m)\)/;
// RTK: playwright_cmd.rs::extract_failures_regex — failing test lines marked with × or ✗.
const FAILURE_RE = /[×✗]\s+.*?›\s+([^›]+\.spec\.[tj]sx?)/g;

function extractPlaywrightRegex(output: string): TestResult | undefined {
  const clean = removeAnsi(output);

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const caps of clean.matchAll(SUMMARY_RE)) {
    const count = Number.parseInt(caps[1] ?? "0", 10) || 0;
    if (caps[2] === "passed") passed = count;
    else if (caps[2] === "failed") failed = count;
    else if (caps[2] === "skipped") skipped = count;
  }

  let durationMs: number | undefined;
  const durationMatch = clean.match(DURATION_RE);
  if (durationMatch) {
    const value = Number.parseFloat(durationMatch[1] ?? "0");
    const unit = durationMatch[2];
    durationMs =
      unit === "s" ? Math.trunc(value * 1000) : unit === "m" ? Math.trunc(value * 60000) : Math.trunc(value);
  }

  const total = passed + failed + skipped;
  if (total <= 0) return undefined;

  const failures: TestFailure[] = [];
  for (const caps of clean.matchAll(FAILURE_RE)) {
    failures.push({ testName: caps[0], errorMessage: "" });
  }

  return { total, passed, failed, skipped, durationMs, failures };
}

// RTK: parser/formatter.rs::TestResult::format_compact — "PASS (p) FAIL (f)" (+ optional
// " skipped (s)"), a blank line then up to 5 numbered failures with indented message
// lines, an overflow note, and an optional "Time: {ms}ms" line.
// ADR 0001 (intentional divergence from RTK's 5-failure cap): a failing test is
// never hidden behind `+N more failures`. Below budget every failure is listed in
// full; over budget step 1 keeps every failing test NAME and drops only the error
// body; step 2 replaces with a failure count.
function formatCompact(result: TestResult): { output: string; omission?: OmissionDeclaration } {
  let summary = `PASS (${result.passed}) FAIL (${result.failed})`;
  if (result.skipped > 0) summary += ` skipped (${result.skipped})`;
  const timeLine = result.durationMs !== undefined ? `\nTime: ${result.durationMs}ms` : "";

  if (result.failures.length === 0) {
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

function formatPlaywright(text: string): { output: string; omission?: OmissionDeclaration } {
  // Tier 1: JSON reporter.
  const json = parsePlaywrightJson(text);
  if (json) return formatCompact(json);

  // Tier 2: regex over the human reporter.
  const regex = extractPlaywrightRegex(text);
  if (regex) return formatCompact(regex);

  // Tier 3: passthrough — let the shared output limiter cap it.
  return { output: text };
}

export const playwrightHandler: CommandHandler = {
  name: "playwright",
  programs: ["playwright"],

  matches(command) {
    return command.program === "playwright";
  },

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    const { output, omission } = formatPlaywright(`${raw.stdout}\n${raw.stderr}`);
    return makeFilteredResult(this.name, raw, output, options, undefined, omission);
  },
};
