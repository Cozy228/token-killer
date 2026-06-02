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
  const lines = text.split(/\r?\n/);
  const summary = lines.filter((line) => /Test Files|Tests\s+|failed|passed/.test(line)).slice(-6);
  const failures = lines
    .filter((line) => /FAIL|AssertionError|expected|\.test\.[tj]sx?:\d+|❯/.test(line))
    .filter((line) => !/noise-\d+/.test(line))
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
