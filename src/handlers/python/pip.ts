import type { ParsedCommand } from "../../types.js";
import { defineHandler } from "../define.js";

// RTK: pip_cmd.rs uses a 39-char box-drawing separator under the summary line.
const PIP_SEPARATOR = "═".repeat(39);
// RTK: rtk/src/core/truncate.rs — CAP_INVENTORY for `pip list`, CAP_LIST for outdated.
const CAP_INVENTORY = 50;
const CAP_LIST = 20;

type PipPackage = { name: string; version: string; latest?: string };

function matchesPip(command: ParsedCommand): boolean {
  return (
    (command.program === "pip" && ["list", "freeze"].includes(command.args[0] ?? "")) ||
    ((command.program === "python" || command.program === "python3") &&
      command.args[0] === "-m" &&
      command.args[1] === "pip" &&
      ["list", "freeze"].includes(command.args[2] ?? ""))
  );
}

// RTK: pip_cmd.rs::filter_pip_list (Tier 1) — `pip list --format=json` is an array of packages.
function parsePipJson(text: string): PipPackage[] | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[")) return undefined;
  let payload: any[];
  try {
    payload = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (!Array.isArray(payload)) return undefined;
  return payload
    .filter((pkg) => typeof pkg?.name === "string")
    .map((pkg) => ({
      name: String(pkg.name),
      version: String(pkg.version ?? ""),
      latest: pkg.latest_version ? String(pkg.latest_version) : undefined,
    }));
}

const PIP_PROBLEM_RE = /invalid|conflict|missing|incompatible|ERROR|WARNING/i;

// `pip list` table output (when --format=json was not used). Skips the header/rule
// rows, captures problem annotations into an additive Problems section.
function parsePipTable(text: string): { packages: PipPackage[]; problems: string[] } {
  const packages: PipPackage[] = [];
  const problems: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (/^Package\s+Version/i.test(trimmed) || /^-{3,}/.test(trimmed)) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2 || !/^\d/.test(parts[1] ?? "")) continue;
    if (PIP_PROBLEM_RE.test(line)) {
      problems.push(trimmed);
      continue;
    }
    packages.push({ name: parts[0]!, version: parts[1]! });
  }
  return { packages, problems };
}

// `pip list --outdated` table output (when --format=json was not used). Columns are
// "Package Version Latest Type"; capture name/current/latest so the outdated formatter
// can render "current → latest" instead of a plain inventory.
function parsePipOutdatedTable(text: string): PipPackage[] {
  const packages: PipPackage[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (/^Package\s+Version/i.test(trimmed) || /^-{3,}/.test(trimmed)) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 3 || !/^\d/.test(parts[1] ?? "") || !/^\d/.test(parts[2] ?? "")) continue;
    packages.push({ name: parts[0]!, version: parts[1]!, latest: parts[2]! });
  }
  return packages;
}

// RTK: pip_cmd.rs::filter_pip_list — header + inventory grouped by initial letter.
function formatPipList(packages: PipPackage[]): string {
  if (packages.length === 0) return "pip list: No packages installed";

  const byLetter = new Map<string, PipPackage[]>();
  for (const pkg of packages) {
    const first = (pkg.name[0] ?? "?").toLowerCase();
    const list = byLetter.get(first) ?? [];
    list.push(pkg);
    byLetter.set(first, list);
  }

  const out = [`pip list: ${packages.length} packages`, PIP_SEPARATOR];
  for (const letter of [...byLetter.keys()].sort()) {
    const pkgs = byLetter.get(letter)!;
    out.push("", `[${letter.toUpperCase()}]`);
    for (const pkg of pkgs.slice(0, CAP_INVENTORY)) out.push(`  ${pkg.name} (${pkg.version})`);
    if (pkgs.length > CAP_INVENTORY) out.push(`  ... +${pkgs.length - CAP_INVENTORY} more`);
  }
  return out.join("\n");
}

// RTK: pip_cmd.rs::filter_pip_outdated — numbered "name (current → latest)" list.
function formatPipOutdated(packages: PipPackage[]): string {
  if (packages.length === 0) return "pip outdated: All packages up to date";

  const out = [`pip outdated: ${packages.length} packages`, PIP_SEPARATOR];
  packages.slice(0, CAP_LIST).forEach((pkg, idx) => {
    out.push(`${idx + 1}. ${pkg.name} (${pkg.version} → ${pkg.latest ?? "unknown"})`);
  });
  if (packages.length > CAP_LIST) out.push("", `... +${packages.length - CAP_LIST} more packages`);
  out.push("", "[hint] Run `pip install --upgrade <package>` to update");
  return out.join("\n");
}

function formatPip(text: string, command: ParsedCommand): string {
  const trimmed = text.trim();
  const isOutdated = command.args.includes("--outdated");
  const isFreeze = command.args.includes("freeze");

  const json = parsePipJson(text);
  if (json) return `${(isOutdated ? formatPipOutdated(json) : formatPipList(json)).trimEnd()}\n`;

  // `pip freeze` is plain "name==version" lines RTK never reformats — pass through.
  if (isFreeze) return trimmed ? `${trimmed}\n` : "\n";

  // `pip list --outdated` table fallback must render the outdated (current → latest)
  // shape, not the plain inventory listing.
  if (isOutdated) {
    if (trimmed.length === 0) return "pip outdated: All packages up to date\n";
    const outdated = parsePipOutdatedTable(text);
    if (outdated.length > 0) return `${formatPipOutdated(outdated).trimEnd()}\n`;
    return trimmed ? `${trimmed}\n` : "\n";
  }

  const { packages, problems } = parsePipTable(text);
  if (packages.length > 0 || problems.length > 0) {
    let out = formatPipList(packages);
    if (problems.length > 0)
      out += `\n\nProblems:\n${problems.map((line) => `- ${line}`).join("\n")}`;
    return `${out.trimEnd()}\n`;
  }

  return trimmed ? `${trimmed}\n` : "\n";
}

export const pipHandler = defineHandler({
  name: "pip",
  traits: { structural: true },
  programs: ["pip"],

  match: matchesPip,

  format: (raw, command, options) => formatPip(`${raw.stdout}\n${raw.stderr}`, command),
});
