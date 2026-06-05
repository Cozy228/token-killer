import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult, rawText } from "../base.js";

// RTK: rust/runner.rs::run_test / extract_test_summary — `test <cmd>` runs a test
// command and extracts only the failures and summary lines, framework-aware
// (cargo / pytest / jest|npm|yarn / go). Per-test "... ok" chatter is dropped.

// RTK: truncate.rs::CAP_WARNINGS = 12, CAP_LIST = 50.
const MAX_RUNNER_FAILURES = 12;
const MAX_RUNNER_LINES = 50;

// RTK: rust/runner.rs::extract_test_summary.
function extractTestSummary(output: string, command: string): string {
  const lines = output.split("\n");

  const isCargo = command.includes("cargo test");
  const isPytest = command.includes("pytest");
  const isJest =
    command.includes("jest") || command.includes("npm test") || command.includes("yarn test");
  // tg divergence (recorded in docs/align-rtk-divergences.md): RTK's runner.rs also
  // has a Go branch (`command.contains("go test")`), but Go is an out-of-scope
  // ecosystem for tg, so the Go branch is intentionally NOT ported. Dropping it also
  // removes RTK's latent bug where `"cargo test"` contains the substring "go test"
  // (car+"go test") and gets run through BOTH branches — duplicating every failure
  // line and folding the `test result:` summary into the FAILURES block.

  const summary: string[] = [];
  const failures: string[] = [];
  const failureLines: string[] = [];
  let inFailure = false;

  for (const line of lines) {
    if (isCargo) {
      if (line.includes("test result:")) summary.push(line);
      if (line.includes("FAILED") && !line.includes("test result")) failures.push(line);
      if (line.startsWith("failures:")) inFailure = true;
      if (inFailure && line.startsWith("    ")) failureLines.push(line);
    }

    if (isPytest) {
      if (line.includes(" passed") || line.includes(" failed") || line.includes(" error")) {
        summary.push(line);
      }
      if (line.includes("FAILED")) failures.push(line);
    }

    if (isJest) {
      if (line.includes("Tests:") || line.includes("Test Suites:")) summary.push(line);
      if (line.includes("✕") || line.includes("FAIL")) failures.push(line);
    }
  }

  const out: string[] = [];

  if (failures.length > 0) {
    out.push("[FAIL] FAILURES:");
    for (const failure of failures.slice(0, MAX_RUNNER_FAILURES)) out.push(`  ${failure}`);
    if (failures.length > MAX_RUNNER_FAILURES) {
      out.push(`  ... +${failures.length - MAX_RUNNER_FAILURES} more failures`);
    }
    for (const failure of failureLines.slice(0, MAX_RUNNER_LINES)) out.push(`  ${failure.trim()}`);
    if (failureLines.length > MAX_RUNNER_LINES) {
      out.push(`  ... +${failureLines.length - MAX_RUNNER_LINES} more`);
    }
    out.push("");
  }

  if (summary.length > 0) {
    out.push("SUMMARY:");
    for (const line of summary) out.push(`  ${line}`);
  } else {
    out.push("OUTPUT (last 5 lines):");
    for (const line of lines.slice(Math.max(0, lines.length - 5))) {
      if (line.trim() !== "") out.push(`  ${line}`);
    }
  }

  return out.join("\n");
}

export const testRunnerHandler: CommandHandler = {
  name: "test",
  matches(command) {
    return command.program === "test" && command.args.length > 0;
  },
  execute(command) {
    return executeCommand({
      program: command.args[0] ?? "",
      args: command.args.slice(1),
      original: command.args,
      displayCommand: command.args.join(" "),
    });
  },
  async filter(raw, command, options) {
    const summary = extractTestSummary(rawText(raw), command.args.join(" "));
    return makeFilteredResult(this.name, raw, summary, options);
  },
};
