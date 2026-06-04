import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";

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

function formatJsTest(text: string, exitCode: number): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const payload = JSON.parse(trimmed);
      if ((payload.numFailedTests ?? 0) === 0) {
        return `PASS (${payload.numPassedTests ?? payload.numTotalTests ?? 0}) FAIL (0)\n`;
      }
      const out = [exitCode === 0 ? "JS tests passed" : "JS tests failed"];
      out.push(`Summary: ${payload.numFailedTests ?? 0} failed, ${payload.numPassedTests ?? 0} passed`);
      for (const file of payload.testResults ?? []) {
        for (const assertion of file.assertionResults ?? []) {
          if (assertion.status === "failed") {
            out.push(`- ${file.name}: ${assertion.title}`);
            for (const message of assertion.failureMessages ?? []) out.push(`  ${message}`);
          }
        }
      }
      return `${out.join("\n")}\n`;
    } catch {
      // Fall through to text parser.
    }
  }

  const lines = text.split(/\r?\n/);
  const testsLine = lines.find((line) => /\bTests\s+/.test(line));
  const passedMatch = testsLine?.match(/(\d+)\s+passed/);
  const failedMatch = testsLine?.match(/(\d+)\s+failed/);
  const passed = passedMatch ? Number.parseInt(passedMatch[1] ?? "0", 10) : 0;
  const failed = failedMatch ? Number.parseInt(failedMatch[1] ?? "0", 10) : 0;
  if (exitCode === 0 && passed > 0 && failed === 0) {
    return `PASS (${passed}) FAIL (0)\n`;
  }
  const summary = lines.filter((line) => /Test Files|Tests\s+|failed|passed/.test(line)).slice(-6);
  const failures = lines
    .filter((line) => /FAIL|AssertionError|expected|\.test\.[tj]sx?:\d+|❯/.test(line))
    .slice(0, 50);
  const out = [exitCode === 0 ? "JS tests passed" : "JS tests failed"];
  if (summary.length > 0) out.push("Summary:", ...summary.map((line) => `- ${line.trim()}`));
  if (failures.length > 0) out.push("", "Failures:", ...failures.map((line) => `- ${line.trim()}`));
  return `${out.join("\n")}\n`;
}

export const jsTestHandler: CommandHandler = {
  name: "js-test",

  matches: matchesJsTest,

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatJsTest(`${raw.stdout}\n${raw.stderr}`, raw.exitCode), options);
  },
};
