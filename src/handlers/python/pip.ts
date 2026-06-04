import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";

function matchesPip(command: ParsedCommand): boolean {
  return (
    (command.program === "pip" && ["list", "freeze"].includes(command.args[0] ?? "")) ||
    ((command.program === "python" || command.program === "python3") &&
      command.args[0] === "-m" &&
      command.args[1] === "pip" &&
      ["list", "freeze"].includes(command.args[2] ?? ""))
  );
}

function formatPip(text: string, command: ParsedCommand): string {
  const trimmed = text.trim();
  if (command.args.includes("--outdated") && trimmed.length === 0) return "No outdated packages\n";
  return trimmed ? `${trimmed}\n` : "\n";
}

export const pipHandler: CommandHandler = {
  name: "pip",

  matches: matchesPip,

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, command, options) {
    return makeFilteredResult(this.name, raw, formatPip(`${raw.stdout}\n${raw.stderr}`, command), options);
  },
};
