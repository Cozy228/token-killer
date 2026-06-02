import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";

function matchesPackageList(command: ParsedCommand): boolean {
  return ["npm", "pnpm", "yarn"].includes(command.program) && command.args.includes("list");
}

function formatPackageList(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const payload = JSON.parse(trimmed);
      const root = Array.isArray(payload) ? payload[0] ?? {} : payload;
      const depsObj = { ...(root.dependencies ?? {}), ...(root.devDependencies ?? {}) };
      const deps = Object.entries(depsObj).map(([name, value]: [string, any]) => `${name}@${value.version ?? value}`);
      return `Dependencies: ${deps.length}\n\nImportant dependencies:\n${deps.map((dep) => `- ${dep}`).join("\n")}\n`;
    } catch {
      // Fall through to text parser.
    }
  }

  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const deps = lines.filter((line) => /[@\w.-]+@\d|\bCurrent\b.*\bLatest\b|^\S+\s+\d+\.\d+\.\d+\s+\d+\.\d+\.\d+/.test(line));
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
