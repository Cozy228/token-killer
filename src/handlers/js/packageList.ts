import { executeCommand } from "../../executor.js";
import { readFileSync } from "node:fs";
import path from "node:path";

import type { CommandHandler, ParsedCommand, TgOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

function matchesPackageList(command: ParsedCommand): boolean {
  return ["npm", "pnpm", "yarn"].includes(command.program) && command.args.includes("list");
}

function isCompactPackageList(text: string): boolean {
  const trimmed = text.trim();
  return /^\d+ packages \(/.test(trimmed) || /^\[prod\]/m.test(trimmed) || /^\[dev\]/m.test(trimmed);
}

type PackageManifest = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

function readPackageManifest(cwd: string): PackageManifest {
  try {
    return JSON.parse(readFileSync(path.join(cwd, "package.json"), "utf8")) as PackageManifest;
  } catch {
    return {};
  }
}

function parseTreeList(text: string, manifest: PackageManifest): string | undefined {
  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return undefined;

  const rootMatch = lines.find((line) => /^@?[\w./-]+@[\w.-]+\s+/.test(line))?.match(/^(@?[\w./-]+)@([\w.-]+)/);
  if (!rootMatch) return undefined;

  const prod: string[] = [];
  const dev: string[] = [];
  let section: "prod" | "dev" = "prod";

  for (const line of lines) {
    if (/devDependencies:/.test(line)) {
      section = "dev";
      continue;
    }
    if (/dependencies:/.test(line)) {
      section = "prod";
      continue;
    }
    if (/invalid|unmet peer|missing|conflict|ERR!|ERROR|WARN/i.test(line)) {
      continue;
    }
    const depMatch = line.match(/([@\w./-]+)@([\w.-]+)/);
    if (!depMatch) continue;
    if (depMatch[1] === rootMatch[1] && depMatch[2] === rootMatch[2]) continue;
    const name = depMatch[1] ?? "";
    const version = depMatch[2] ?? "";
    const entry = `${name} ${version}`;
    if (section === "prod") prod.push(entry);
    else dev.push(entry);
  }

  if (prod.length === 0 && dev.length === 0) return undefined;

  const out = ["Node.js (package.json):", `  ${rootMatch[1]} @ ${rootMatch[2]}`];
  if (prod.length > 0) {
    out.push(
      `  Dependencies (${prod.length}):`,
      ...prod.map((entry) => {
        const [name, version] = entry.split(" ");
        const spec = (name && manifest.dependencies?.[name]) || version || "*";
        return `    ${name} (${spec})`;
      }),
    );
  }
  if (dev.length > 0) {
    out.push(`  Dev Dependencies (${dev.length}):`, ...dev.map((entry) => `    ${entry.split(" ")[0]}`));
  }
  return `${out.join("\n")}\n`;
}

function formatProblems(lines: string[]): string[] {
  return lines
    .filter((line) => /invalid|unmet peer|missing|conflict|ERR!|ERROR|WARN/i.test(line))
    .map((line) => line.trim());
}

function formatPackageList(text: string, options: TgOptions): string {
  const trimmed = text.trim();
  if (!trimmed) return "\n";
  if (isCompactPackageList(trimmed)) {
    return `${trimmed}\n`;
  }

  const treeFormatted = parseTreeList(trimmed, readPackageManifest(options.cwd));
  if (treeFormatted) {
    const problems = formatProblems(text.split(/\r?\n/));
    if (problems.length === 0) return treeFormatted;
    return `${treeFormatted.trimEnd()}\n\nProblems:\n${problems.map((line) => `- ${line}`).join("\n")}\n`;
  }

  const lines = text.split(/\r?\n/).filter((line) => line.trim());
  const deps = lines.filter((line) => /[@\w./-]+@[\w.-]+/.test(line));
  const problems = formatProblems(lines);
  const out: string[] = [`${deps.length} packages`];
  for (const dep of deps) {
    out.push(dep.trim());
  }
  if (problems.length > 0) {
    out.push("", "Problems:", ...problems.map((line) => `- ${line}`));
  }
  return `${out.join("\n")}\n`;
}

export const packageListHandler: CommandHandler = {
  name: "package-list",

  matches: matchesPackageList,

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatPackageList(`${raw.stdout}\n${raw.stderr}`, options), options);
  },
};
