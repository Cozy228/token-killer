import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";

function matchesPytest(command: ParsedCommand): boolean {
  return (
    command.program === "pytest" ||
    ((command.program === "python" || command.program === "python3") &&
      command.args[0] === "-m" &&
      command.args[1] === "pytest")
  );
}

function formatPytest(text: string, exitCode: number): string {
  const lines = text.split(/\r?\n/);
  const summary = [...lines].reverse().find((line) => /\b(failed|passed|warnings?|skipped|no tests ran)\b/.test(line) && (/\d/.test(line) || /no tests ran/.test(line)));
  const failed = lines.filter((line) => line.startsWith("FAILED ") || line.includes("::test_")).slice(0, 20);
  const important = lines
    .filter((line) => /^E\s+|^>\s+|AssertionError|\.py:\d+/.test(line.trim()))
    .slice(0, 40);

  const out = [exitCode === 0 ? "Pytest passed" : "Pytest failed"];
  if (summary) out.push(`Summary: ${summary.trim()}`);
  if (failed.length > 0 || important.length > 0) {
    out.push("", "Failures:");
    for (const line of [...failed, ...important]) {
      out.push(`- ${line.trim()}`);
    }
  }
  return `${out.join("\n")}\n`;
}

export const pytestHandler: CommandHandler = {
  name: "pytest",

  matches: matchesPytest,

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatPytest(`${raw.stdout}\n${raw.stderr}`, raw.exitCode), options);
  },
};
