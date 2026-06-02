import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";

function formatBranch(text: string): string {
  const branches = text
    .split(/\r?\n/)
    .map((line) => ({ current: line.trimStart().startsWith("*"), name: line.replace(/^\s*\*?\s*/, "").trim() }))
    .filter((branch) => branch.name);
  if (branches.length === 0) return "Current: unknown\nBranches: 0, showing 0\n";
  if (branches.length <= 2) return text.endsWith("\n") ? text : `${text}\n`;

  const current = branches.find((branch) => branch.current)?.name ?? "unknown";
  const nearby = branches
    .filter((branch) => branch.current || ["main", "master"].includes(branch.name) || branch.name.startsWith("codex/") || branch.name.startsWith("release/"))
    .slice(0, 20);

  const lines = [`Current: ${current}`, `Branches: ${branches.length}, showing ${nearby.length}`, ""];
  for (const branch of nearby) {
    lines.push(`${branch.current ? "*" : "-"} ${branch.name}`);
  }
  if (branches.length > nearby.length) {
    lines.push("", "Hidden:", `- ${branches.length - nearby.length} branches not shown`);
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
