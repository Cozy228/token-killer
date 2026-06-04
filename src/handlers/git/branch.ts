import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";

function formatBranch(text: string): string {
  const branches = text
    .split(/\r?\n/)
    .map((line) => ({ current: line.trimStart().startsWith("*"), name: line.replace(/^\s*\*?\s*/, "").trim() }))
    .filter((branch) => branch.name);
  if (branches.length === 0) return "Current: unknown\nBranches: 0\n";
  if (branches.length <= 2) return text.endsWith("\n") ? text : `${text}\n`;

  const current = branches.find((branch) => branch.current)?.name ?? "unknown";
  const lines = [`Current: ${current}`, `Branches: ${branches.length}`, ""];
  for (const branch of branches) {
    lines.push(`${branch.current ? "*" : "-"} ${branch.name}`);
  }
  return `${lines.join("\n")}\n`;
}

export const gitBranchHandler: CommandHandler = {
  name: "git-branch",

  matches(command) {
    return command.program === "git" && command.args[0] === "branch";
  },

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatBranch(raw.stdout || raw.stderr), options);
  },
};
