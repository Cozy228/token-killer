import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TkOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

// RTK: system/wc_cmd.rs — strip redundant paths and alignment padding from wc.
//   wc file        → "30L 96W 978B"
//   wc -l file     → "30"
//   wc -l *.py     → table with common path prefix stripped + "Σ" total.
type WcMode = "full" | "lines" | "words" | "bytes" | "chars" | "mixed";

// RTK: wc_cmd.rs::detect_mode.
function detectMode(args: string[]): WcMode {
  const flags = args.filter((a) => a.startsWith("-"));
  if (flags.length === 0) return "full";
  let hasL = false;
  let hasW = false;
  let hasC = false;
  let hasM = false;
  let flagCount = 0;
  for (const flag of flags) {
    for (const ch of flag.slice(1)) {
      if (ch === "l") {
        hasL = true;
        flagCount += 1;
      } else if (ch === "w") {
        hasW = true;
        flagCount += 1;
      } else if (ch === "c") {
        hasC = true;
        flagCount += 1;
      } else if (ch === "m") {
        hasM = true;
        flagCount += 1;
      }
    }
  }
  if (flagCount === 0) return "full";
  if (flagCount > 1) return "mixed";
  if (hasL) return "lines";
  if (hasW) return "words";
  if (hasC) return "bytes";
  if (hasM) return "chars";
  return "full";
}

function isNumeric(s: string): boolean {
  return /^\d+$/.test(s);
}

// RTK: wc_cmd.rs::format_single_line.
function formatSingleLine(line: string, mode: WcMode): string {
  const parts = line.trim().split(/\s+/);
  switch (mode) {
    case "lines":
    case "words":
    case "bytes":
    case "chars":
      return parts[0] ?? "";
    case "full":
      return parts.length >= 3 ? `${parts[0]}L ${parts[1]}W ${parts[2]}B` : line.trim();
    case "mixed": {
      if (parts.length >= 2) {
        const lastIsPath = !isNumeric(parts[parts.length - 1]!);
        return lastIsPath ? parts.slice(0, -1).join(" ") : parts.join(" ");
      }
      return line.trim();
    }
  }
}

// RTK: wc_cmd.rs::find_common_prefix.
function findCommonPrefix(paths: string[]): string {
  if (paths.length <= 1) return "";
  const first = paths[0]!;
  const pos = first.lastIndexOf("/");
  if (pos === -1) return "";
  let candidate = first.slice(0, pos + 1);
  while (candidate !== "") {
    if (paths.every((p) => p.startsWith(candidate))) return candidate;
    const next = candidate.slice(0, candidate.length - 1).lastIndexOf("/");
    if (next === -1) return "";
    candidate = candidate.slice(0, next + 1);
  }
  return "";
}

function stripPrefix(pathValue: string, prefix: string): string {
  if (prefix === "") return pathValue;
  return pathValue.startsWith(prefix) ? pathValue.slice(prefix.length) : pathValue;
}

// RTK: wc_cmd.rs::format_multi_line.
function formatMultiLine(lines: string[], mode: WcMode): string {
  const paths = lines
    .map((line) => line.trim().split(/\s+/).at(-1))
    .filter((p): p is string => p !== undefined && p !== "total");
  const commonPrefix = findCommonPrefix(paths);
  const result: string[] = [];
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length === 0 || parts[0] === "") continue;
    const isTotal = parts.at(-1) === "total";
    if (mode === "lines" || mode === "words" || mode === "bytes" || mode === "chars") {
      if (isTotal) result.push(`Σ ${parts[0] ?? "0"}`);
      else result.push(`${parts[0] ?? "0"} ${stripPrefix(parts.at(-1) ?? "", commonPrefix)}`);
    } else if (mode === "full") {
      if (isTotal) {
        result.push(`Σ ${parts[0] ?? "0"}L ${parts[1] ?? "0"}W ${parts[2] ?? "0"}B`);
      } else if (parts.length >= 4) {
        result.push(`${parts[0]}L ${parts[1]}W ${parts[2]}B ${stripPrefix(parts[3]!, commonPrefix)}`);
      } else {
        result.push(line.trim());
      }
    } else {
      // mixed
      if (isTotal) {
        result.push(`Σ ${parts.slice(0, -1).join(" ")}`);
      } else if (parts.length >= 2) {
        const lastIsPath = !isNumeric(parts.at(-1)!);
        if (lastIsPath) {
          result.push(`${parts.slice(0, -1).join(" ")} ${stripPrefix(parts.at(-1)!, commonPrefix)}`);
        } else {
          result.push(parts.join(" "));
        }
      } else {
        result.push(line.trim());
      }
    }
  }
  return result.join("\n");
}

// RTK: wc_cmd.rs::filter_wc_output.
function filterWc(raw: string, mode: WcMode): string {
  const lines = raw.trim().split("\n").filter((l) => l !== "");
  if (lines.length === 0) return "";
  if (lines.length === 1) return formatSingleLine(lines[0]!, mode);
  return formatMultiLine(lines, mode);
}

function formatWc(raw: RawResult, command: ParsedCommand): string {
  const mode = detectMode(command.args);
  return `${filterWc(raw.stdout, mode)}\n`;
}

export const wcHandler: CommandHandler = {
  name: "wc",
  programs: ["wc"],
  matches(command) {
    return command.program === "wc";
  },
  execute(command) {
    return executeCommand(command);
  },
  async filter(raw, command, options: TkOptions) {
    return makeFilteredResult(this.name, raw, formatWc(raw, command), options);
  },
};
