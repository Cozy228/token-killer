import { executeCommand } from "../../executor.js";

import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";

// RTK: rtk/src/core/truncate.rs::CAP_LIST — cap each [prod]/[dev] section at 20 entries.
const CAP_LIST = 20;

// RTK: rtk/src/parser/types.rs::Dependency (subset used by `pnpm list`).
type Dependency = { name: string; version: string; dev: boolean };
type DependencyState = { totalPackages: number; dependencies: Dependency[] };

function matchesPackageList(command: ParsedCommand): boolean {
  if (!["npm", "pnpm", "yarn"].includes(command.program)) return false;
  // Match only when the SUBCOMMAND is `list` or its alias `ls` — i.e. the first
  // non-flag arg. Using args.includes() would wrongly capture commands that merely
  // carry "list"/"ls" as a value (e.g. `npm install ls`, `npm run ls`). Mirrors
  // npm.ts matchesNpm so the two handlers partition npm cleanly.
  const subcommand = command.args.find((a) => !a.startsWith("-"));
  return subcommand === "list" || subcommand === "ls";
}

function isCompactPackageList(text: string): boolean {
  const trimmed = text.trim();
  return /^\d+ packages \(/.test(trimmed) || /^\[prod\]/m.test(trimmed) || /^\[dev\]/m.test(trimmed);
}

// RTK: pnpm_cmd.rs::collect_dependencies — recursively flatten a `pnpm list --json`
// tree, carrying the prod/dev classification down each branch.
function collectJsonDeps(
  name: string,
  pkg: any,
  isDev: boolean,
  deps: Dependency[],
): void {
  if (typeof pkg?.version === "string") {
    deps.push({ name, version: pkg.version, dev: isDev });
  }
  for (const [depName, depPkg] of Object.entries(pkg?.dependencies ?? {})) {
    collectJsonDeps(depName, depPkg, isDev, deps);
  }
  for (const [depName, depPkg] of Object.entries(pkg?.devDependencies ?? {})) {
    collectJsonDeps(depName, depPkg, true, deps);
  }
}

// RTK: pnpm_cmd.rs::PnpmListParser (Tier 1) — `pnpm list --json` is an array of root packages.
function parseListJson(text: string): DependencyState | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[")) return undefined;
  let payload: any[];
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (!Array.isArray(payload)) return undefined;
  const deps: Dependency[] = [];
  for (const pkg of payload) {
    if (typeof pkg?.name === "string") collectJsonDeps(pkg.name, pkg, false, deps);
  }
  if (deps.length === 0) return undefined;
  return { totalPackages: deps.length, dependencies: deps };
}

const PROBLEM_RE = /invalid|unmet peer|missing|conflict|ERR!|ERROR|WARN/i;
const BOX_PREFIX_RE = /^[│├└─\s]+/;

// RTK: pnpm_cmd.rs::extract_list_text (Tier 2) — recover the dependency listing from the
// human reporter. tg additionally strips box-drawing prefixes so real `pnpm list` tree
// output is parsed (RTK skips those lines entirely and loses every dep), and captures
// npm problem lines (invalid/unmet peer/missing) into an additive Problems section.
function extractListText(text: string): { state?: DependencyState; problems: string[] } {
  const deps: Dependency[] = [];
  const problems: string[] = [];
  let isDev = false;

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (/devDependencies:/.test(line)) {
      isDev = true;
      continue;
    }
    if (/dependencies:/.test(line)) {
      isDev = false;
      continue;
    }
    if (/Legend:/.test(line)) continue;
    if (PROBLEM_RE.test(line)) {
      problems.push(trimmed.replace(BOX_PREFIX_RE, ""));
      continue;
    }
    const stripped = trimmed.replace(BOX_PREFIX_RE, "");
    const match = stripped.match(/^(@?[\w./-]+)@([\w.-]+)/);
    if (match) deps.push({ name: match[1]!, version: match[2]!, dev: isDev });
  }

  const state = deps.length > 0 ? { totalPackages: deps.length, dependencies: deps } : undefined;
  return { state, problems };
}

// RTK: pnpm_cmd.rs::format_dependency_listing — "N packages (X prod / Y dev)" then grouped
// [prod]/[dev] sections, each capped at CAP_LIST with a "… +N more" overflow marker.
function formatDependencyListing(state: DependencyState, cap: boolean): string {
  const prod = state.dependencies.filter((dep) => !dep.dev);
  const dev = state.dependencies.filter((dep) => dep.dev);
  const total = Math.max(state.totalPackages, state.dependencies.length);

  const lines = [`${total} packages (${prod.length} prod / ${dev.length} dev)`];

  for (const [label, group] of [
    ["[prod]", prod],
    ["[dev]", dev],
  ] as const) {
    if (group.length === 0) continue;
    lines.push(label);
    const shown = cap ? Math.min(group.length, CAP_LIST) : group.length;
    for (const dep of group.slice(0, shown)) lines.push(`  ${dep.name} ${dep.version}`);
    if (cap && group.length > CAP_LIST) lines.push(`  … +${group.length - CAP_LIST} more`);
  }

  return lines.join("\n");
}

function formatPackageList(text: string, args: string[]): string {
  const trimmed = text.trim();
  if (!trimmed) return "\n";
  if (isCompactPackageList(trimmed)) return `${trimmed}\n`;

  // `--prod`/`--dev` target a single category — show every package so the hidden ones
  // surface (RTK: cap=false). Plain `pnpm list` may truncate (cap=true).
  const cap = !args.some((arg) => ["--prod", "-P", "--dev", "-D"].includes(arg));

  const state = parseListJson(text);
  if (state) return `${formatDependencyListing(state, cap)}\n`;

  const { state: textState, problems } = extractListText(text);
  if (textState) {
    let out = formatDependencyListing(textState, cap);
    if (problems.length > 0) {
      out += `\n\nProblems:\n${problems.map((line) => `- ${line}`).join("\n")}`;
    }
    return `${out}\n`;
  }

  // No parseable dependency data — surface any problems, else passthrough.
  if (problems.length > 0) {
    return `Problems:\n${problems.map((line) => `- ${line}`).join("\n")}\n`;
  }
  return `${trimmed}\n`;
}

export const packageListHandler: CommandHandler = {
  name: "package-list",

  matches: matchesPackageList,

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, command, options) {
    return makeFilteredResult(
      this.name,
      raw,
      formatPackageList(`${raw.stdout}\n${raw.stderr}`, command.args),
      options,
    );
  },
};
