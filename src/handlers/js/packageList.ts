import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";

function matchesPackageList(command: ParsedCommand): boolean {
  return ["npm", "pnpm", "yarn"].includes(command.program) && command.args.includes("list");
}

function formatPackageList(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const deps = lines.filter((line) => /[@\w.-]+@\d/.test(line));
  const problems = lines.filter((line) => /invalid|unmet peer|missing|conflict|ERR!|ERROR|WARN/i.test(line));
  const out = [`Dependencies: ${deps.length}`];
  const direct = deps.filter((line) => !/package-\d+@/.test(line)).slice(0, 30);
  if (direct.length > 0) out.push("", "Important dependencies:", ...direct.map((line) => `- ${line.trim()}`));
  if (problems.length > 0) out.push("", "Problems:", ...problems.slice(0, 30).map((line) => `- ${line.trim()}`));
  if (deps.length > direct.length) out.push("", `Hidden: ${deps.length - direct.length} dependencies not shown`);
  return `${out.join("\n")}\n`;
}

export const packageListHandler: CommandHandler = {
  name: "package-list",

  matches: matchesPackageList,

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatPackageList(`${raw.stdout}\n${raw.stderr}`), options);
  },
};
