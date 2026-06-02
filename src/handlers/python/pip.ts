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

function formatPip(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const packages = lines.filter((line) => /^[A-Za-z0-9_.-]+(?:==|\s+)\S+/.test(line));
  const problems = lines.filter((line) => /invalid|unmet|peer|conflict|missing|WARNING|ERROR|audit|security/i.test(line));
  const shownPackages = packages.slice(0, 30);

  const out = [`Packages: ${packages.length}`];
  if (shownPackages.length > 0) {
    out.push("", "Direct sample:");
    for (const line of shownPackages) out.push(`- ${line.trim()}`);
  }
  if (problems.length > 0) {
    out.push("", "Problems:");
    for (const line of problems.slice(0, 20)) out.push(`- ${line.trim()}`);
  }
  if (packages.length > shownPackages.length) {
    out.push("", `Hidden: ${packages.length - shownPackages.length} packages not shown`);
  }
  return `${out.join("\n")}\n`;
}

export const pipHandler: CommandHandler = {
  name: "pip",

  matches: matchesPip,

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatPip(`${raw.stdout}\n${raw.stderr}`), options);
  },
};
