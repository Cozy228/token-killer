import type { OmissionDeclaration, ParsedCommand } from "../../types.js";
import { defineHandler } from "../define.js";
import { overBudgetLadder } from "../common/budget.js";

// RTK: pip_cmd.rs uses a 39-char box-drawing separator under the summary line.
const PIP_SEPARATOR = "═".repeat(39);

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
// M20-pip fix: the old per-letter `+N more` cap is replaced by the ADR 0001
// over-budget ladder so the base sniffer never sees a bare `+N more` marker.
function formatPipList(packages: PipPackage[]): { output: string; omission?: OmissionDeclaration } {
  if (packages.length === 0) return { output: "pip list: No packages installed" };

  const byLetter = new Map<string, PipPackage[]>();
  for (const pkg of packages) {
    const first = (pkg.name[0] ?? "?").toLowerCase();
    const list = byLetter.get(first) ?? [];
    list.push(pkg);
    byLetter.set(first, list);
  }

  // Full listing: every package under every letter, no cap.
  const renderFull = (): string => {
    const out = [`pip list: ${packages.length} packages`, PIP_SEPARATOR];
    for (const letter of [...byLetter.keys()].sort()) {
      const pkgs = byLetter.get(letter)!;
      out.push("", `[${letter.toUpperCase()}]`);
      for (const pkg of pkgs) out.push(`  ${pkg.name} (${pkg.version})`);
    }
    return out.join("\n");
  };

  // Step-1 lossless digest: names only (drop version strings to shrink tokens).
  const renderDigest = (): string => {
    const out = [`pip list: ${packages.length} packages`, PIP_SEPARATOR];
    for (const letter of [...byLetter.keys()].sort()) {
      const pkgs = byLetter.get(letter)!;
      out.push("", `[${letter.toUpperCase()}]`);
      for (const pkg of pkgs) out.push(`  ${pkg.name}`);
    }
    return out.join("\n");
  };

  const ladder = overBudgetLadder({
    full: renderFull(),
    digest: renderDigest,
    replacement: () => `pip list: ${packages.length} packages (over budget)`,
  });
  return { output: ladder.text, omission: ladder.omission };
}

// RTK: pip_cmd.rs::filter_pip_outdated — numbered "name (current → latest)" list.
// M20-pip fix: the old `+N more` cap replaced by the ADR 0001 ladder.
function formatPipOutdated(packages: PipPackage[]): {
  output: string;
  omission?: OmissionDeclaration;
} {
  if (packages.length === 0) return { output: "pip outdated: All packages up to date" };

  const renderFull = (): string => {
    const out = [`pip outdated: ${packages.length} packages`, PIP_SEPARATOR];
    packages.forEach((pkg, idx) => {
      out.push(`${idx + 1}. ${pkg.name} (${pkg.version} → ${pkg.latest ?? "unknown"})`);
    });
    out.push("", "[hint] Run `pip install --upgrade <package>` to update");
    return out.join("\n");
  };

  // Step-1 digest: drop the hint line and version arrows; keep names.
  const renderDigest = (): string => {
    const out = [`pip outdated: ${packages.length} packages`, PIP_SEPARATOR];
    packages.forEach((pkg, idx) => {
      out.push(`${idx + 1}. ${pkg.name} (${pkg.version} → ${pkg.latest ?? "unknown"})`);
    });
    return out.join("\n");
  };

  const ladder = overBudgetLadder({
    full: renderFull(),
    digest: renderDigest,
    replacement: () => `pip outdated: ${packages.length} packages (over budget)`,
  });
  return { output: ladder.text, omission: ladder.omission };
}

function formatPip(
  text: string,
  command: ParsedCommand,
): { output: string; omission?: OmissionDeclaration } {
  const trimmed = text.trim();
  const isOutdated = command.args.includes("--outdated");
  const isFreeze = command.args.includes("freeze");

  const json = parsePipJson(text);
  if (json) {
    const result = isOutdated ? formatPipOutdated(json) : formatPipList(json);
    return { output: `${result.output.trimEnd()}\n`, omission: result.omission };
  }

  // `pip freeze` is plain "name==version" lines RTK never reformats — pass through.
  if (isFreeze) return { output: trimmed ? `${trimmed}\n` : "\n" };

  // `pip list --outdated` table fallback must render the outdated (current → latest)
  // shape, not the plain inventory listing.
  if (isOutdated) {
    if (trimmed.length === 0) return { output: "pip outdated: All packages up to date\n" };
    const outdated = parsePipOutdatedTable(text);
    if (outdated.length > 0) {
      const result = formatPipOutdated(outdated);
      return { output: `${result.output.trimEnd()}\n`, omission: result.omission };
    }
    return { output: trimmed ? `${trimmed}\n` : "\n" };
  }

  const { packages, problems } = parsePipTable(text);
  if (packages.length > 0 || problems.length > 0) {
    const result = formatPipList(packages);
    let out = result.output;
    if (problems.length > 0)
      out += `\n\nProblems:\n${problems.map((line) => `- ${line}`).join("\n")}`;
    return { output: `${out.trimEnd()}\n`, omission: result.omission };
  }

  return { output: trimmed ? `${trimmed}\n` : "\n" };
}

export const pipHandler = defineHandler({
  name: "pip",
  traits: { structural: true, ladder: true },
  programs: ["pip"],

  match: matchesPip,

  format: (raw, command, options) => formatPip(`${raw.stdout}\n${raw.stderr}`, command),
});
