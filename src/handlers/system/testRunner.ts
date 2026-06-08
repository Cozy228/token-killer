import { executeCommand } from "../../executor.js";
import type { CommandHandler, OmissionDeclaration } from "../../types.js";
import { makeFilteredResult, rawText } from "../base.js";
import { overBudgetLadder } from "../common/budget.js";

// RTK: rust/runner.rs::run_test / extract_test_summary — `test <cmd>` runs a test
// command and extracts only the failures and summary lines, framework-aware
// (cargo / pytest / jest|npm|yarn / go). Per-test "... ok" chatter is dropped.
// ADR 0001 (intentional divergence from RTK's CAP_WARNINGS=12 / CAP_LIST=50): a
// failing test and its diagnostic lines are evidence and are never hidden behind a
// `+N more`. All failures are listed below budget; over budget step 1 keeps every
// failure header (drops the detail lines), step 2 replaces with a count.

// RTK: rust/runner.rs::extract_test_summary.
function extractTestSummary(
  output: string,
  command: string,
): { output: string; omission?: OmissionDeclaration } {
  const lines = output.split("\n");

  const isCargo = command.includes("cargo test");
  const isPytest = command.includes("pytest");
  const isJest =
    command.includes("jest") || command.includes("npm test") || command.includes("yarn test");
  // tk divergence (recorded in docs/align-rtk-divergences.md): RTK's runner.rs also
  // has a Go branch (`command.contains("go test")`), but Go is an out-of-scope
  // ecosystem for tk, so the Go branch is intentionally NOT ported. Dropping it also
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

  const tail = (): string[] => {
    const out: string[] = [];
    if (summary.length > 0) {
      out.push("SUMMARY:");
      for (const line of summary) out.push(`  ${line}`);
    } else {
      out.push("OUTPUT (last 5 lines):");
      for (const line of lines.slice(Math.max(0, lines.length - 5))) {
        if (line.trim() !== "") out.push(`  ${line}`);
      }
    }
    return out;
  };

  if (failures.length === 0) {
    return { output: tail().join("\n") };
  }

  // full: every failure header + every diagnostic line. digest: every failure
  // header, drop the diagnostic lines. replacement: failure count only.
  const render = (withDetail: boolean): string => {
    const out = ["[FAIL] FAILURES:"];
    for (const failure of failures) out.push(`  ${failure}`);
    if (withDetail) for (const detail of failureLines) out.push(`  ${detail.trim()}`);
    out.push("");
    return [...out, ...tail()].join("\n");
  };

  const ladder = overBudgetLadder({
    full: render(true),
    digest: () => render(false),
    replacement: () =>
      [`[FAIL] ${failures.length} failures (over budget)`, "", ...tail()].join("\n"),
  });
  return { output: ladder.text, omission: ladder.omission };
}

export const testRunnerHandler: CommandHandler = {
  name: "test",
  traits: { structural: true, ladder: true },
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
    const { output, omission } = extractTestSummary(rawText(raw), command.args.join(" "));
    return makeFilteredResult(this, raw, output, options, undefined, omission);
  },
};
