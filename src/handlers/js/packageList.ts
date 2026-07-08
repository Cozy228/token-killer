import type { ParsedCommand } from "../../types.js";
import { defineHandler } from "../define.js";
import { type LadderResult, overBudgetLadder } from "../common/budget.js";

// ADR 0001 decisions 2/5/7: RTK's CAP_LIST (20-per-section) + "… +N more" marker is
// REMOVED. `name version` is already minimal evidence (the version drives the
// dependency-conflict probe), so there is no lossless step-1 digest — within budget
// every package lists; over budget it falls to a count replacement. No "… +N more".

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
  return (
    /^\d+ packages \(/.test(trimmed) || /^\[prod\]/m.test(trimmed) || /^\[dev\]/m.test(trimmed)
  );
}

// RTK: pnpm_cmd.rs::collect_dependencies — recursively flatten a `pnpm list --json`
// tree, carrying the prod/dev classification down each branch.
function collectJsonDeps(name: string, pkg: any, isDev: boolean, deps: Dependency[]): void {
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

// H14: extended to catch `UNMET DEPENDENCY`, `extraneous`, and `invalid` package
// states that npm ls emits on exit 1. These are real dependency problems that the
// old regex missed, causing an exit-1 `npm ls` to render as a healthy package count.
const PROBLEM_RE =
  /invalid|unmet\s+(?:peer\s+)?dependency|extraneous|missing|conflict|ERR!|ERROR|WARN/i;
const BOX_PREFIX_RE = /^[│├└─\s]+/;

// RTK: pnpm_cmd.rs::extract_list_text (Tier 2) — recover the dependency listing from the
// human reporter. ctx additionally strips box-drawing prefixes so real `pnpm list` tree
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

// RTK: pnpm_cmd.rs::format_dependency_listing — "N packages (X prod / Y dev)" then
// grouped [prod]/[dev] sections. Within budget every package lists; over budget the
// listing falls to the count-only summary line (a step-2 replacement).
function formatDependencyListing(state: DependencyState): LadderResult {
  const prod = state.dependencies.filter((dep) => !dep.dev);
  const dev = state.dependencies.filter((dep) => dep.dev);
  const total = Math.max(state.totalPackages, state.dependencies.length);
  const summary = `${total} packages (${prod.length} prod / ${dev.length} dev)`;

  const buildFull = (): string => {
    const lines = [summary];
    for (const [label, group] of [
      ["[prod]", prod],
      ["[dev]", dev],
    ] as const) {
      if (group.length === 0) continue;
      lines.push(label);
      for (const dep of group) lines.push(`  ${dep.name} ${dep.version}`);
    }
    return lines.join("\n");
  };

  return overBudgetLadder({
    full: buildFull(),
    replacement: () => summary,
  });
}

function formatPackageList(text: string): LadderResult {
  const trimmed = text.trim();
  if (!trimmed) return { text: "\n" };
  if (isCompactPackageList(trimmed)) return { text: `${trimmed}\n` };

  const state = parseListJson(text);
  if (state) {
    const ladder = formatDependencyListing(state);
    return { text: `${ladder.text}\n`, omission: ladder.omission };
  }

  const { state: textState, problems } = extractListText(text);
  if (textState) {
    const ladder = formatDependencyListing(textState);
    let out = ladder.text;
    if (problems.length > 0) {
      out += `\n\nProblems:\n${problems.map((line) => `- ${line}`).join("\n")}`;
    }
    return { text: `${out}\n`, omission: ladder.omission };
  }

  // No parseable dependency data — surface any problems, else passthrough.
  if (problems.length > 0) {
    return { text: `Problems:\n${problems.map((line) => `- ${line}`).join("\n")}\n` };
  }
  return { text: `${trimmed}\n` };
}

export const packageListHandler = defineHandler({
  name: "package-list",
  traits: { cacheable: true, ttlClass: "slow" },

  match: matchesPackageList,

  format: (raw, _command, options) => {
    const { text, omission } = formatPackageList(`${raw.stdout}\n${raw.stderr}`);
    return { output: text, omission };
  },
});
