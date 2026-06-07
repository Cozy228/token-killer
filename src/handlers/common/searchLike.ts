import { executeCommand } from "../../executor.js";
import type { CommandHandler, OmissionDeclaration, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";
import {
  type GrepGroupOptions,
  groupGrepOutput,
  hasContextFlag,
  hasFormatFlag,
} from "./grepFilter.js";
import { type CompressionLevel, parseLevel, stripLevelFlags } from "./level.js";

const SEARCH_PROGRAMS = new Set(["rg", "grep"]);

// Common rg/grep flags whose FOLLOWING arg is a value, not the search pattern.
// Conservative list — only used to keep `cleanLine`'s centering word honest, so
// an omission degrades to head-truncation, never to dropped content.
const VALUE_FLAGS = new Set([
  "-f",
  "--file",
  "-g",
  "--glob",
  "--iglob",
  "-t",
  "--type",
  "-T",
  "--type-not",
  "-m",
  "--max-count",
  "-M",
  "--max-columns",
  "--sort",
  "--sortr",
]);

// Best-effort pattern extraction for centering long lines. `-e/--regexp` and the
// `--` delimiter explicitly designate the pattern; otherwise return the first
// positional that is not a flag or a valued flag's argument.
function searchPattern(args: string[]): string {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    // After `--`, the next token is the (possibly dash-leading) pattern.
    if (arg === "--") return args[index + 1] ?? "";
    if (arg === "-e" || arg === "--regexp") return args[index + 1] ?? "";
    if (arg.startsWith("--regexp=")) return arg.slice("--regexp=".length);
    if (VALUE_FLAGS.has(arg)) {
      index += 1; // skip this flag's value
      continue;
    }
    if (arg.startsWith("-")) continue;
    return arg;
  }
  return "";
}

// RTK: grep_cmd.rs::run — RTK re-invokes the search with `-nH` so every match is
// emitted as `file:line:content`, which is what the grouping parser needs. A raw
// `grep -r pattern dir` omits line numbers (and, for a single file, the filename),
// so tk cannot group it and falls back to passthrough (0% savings). Forcing `-n`
// and `-H` restores the parseable shape, and the per-file / global caps then
// compress a large recursive search.
//
// rg IS rewritten too (parity with RTK's real behavior): piped to a non-TTY, `rg`
// OMITS line numbers by default, so its output is unparseable and falls back to
// passthrough (0% savings). Forcing `-n -H --no-heading` restores
// `file:line:content`. Deliberate divergence from RTK: tk does NOT add
// `--no-ignore-vcs` — it keeps rg's default .gitignore-respecting scope, which
// yields less, more relevant output for an agent. Format flags (-c/-l/-L/-o/-Z/
// --json) and context flags (-A/-B/-C) always pass through (see grepFilter).
export function buildGrepArgs(program: string, userArgs: string[]): string[] {
  const cleaned = stripLevelFlags(userArgs);
  if (hasContextFlag(cleaned) || hasFormatFlag(cleaned)) return cleaned;
  // `--level none` is the verbatim opt-out (= --raw): run the user's ORIGINAL
  // command, do NOT inject -n/-H — otherwise the "passthrough" output carries
  // line numbers the raw invocation never produced.
  if (parseLevel(userArgs, { fallback: "balanced" }) === "none") return cleaned;
  // Force the parseable `file:line:content` shape, but only inject flags the user
  // didn't already pass — re-prepending produces the cosmetic `-n -H -n -H` doubling
  // seen in history when an agent already typed them. (Duplicates are harmless to
  // grep/rg; this just keeps the executed command clean.)
  if (program === "grep") return [...missingFlags(cleaned, ["-n", "-H"]), ...cleaned];
  if (program === "rg") return [...missingFlags(cleaned, ["-n", "-H", "--no-heading"]), ...cleaned];
  return cleaned;
}

// Long-form equivalents of the shape flags we inject — if the user already asked
// for line numbers / filenames by their long name, don't add the short one too.
const FLAG_ALIASES: Record<string, readonly string[]> = {
  "-n": ["-n", "--line-number"],
  "-H": ["-H", "--with-filename"],
  "--no-heading": ["--no-heading"],
};

function missingFlags(args: string[], wanted: readonly string[]): string[] {
  return wanted.filter((flag) => !FLAG_ALIASES[flag]!.some((alias) => args.includes(alias)));
}

// Map the shared --level dial onto the grouping caps. `none` is handled before
// grouping (passthrough). Each step adds a layer; lower levels never drop more.
function grepOptionsForLevel(level: CompressionLevel): GrepGroupOptions {
  switch (level) {
    case "minimal":
      // Layer 1 only: dedup + grouping, caps disabled — every match kept, lossless.
      return {
        dedupe: true,
        maxLen: Number.POSITIVE_INFINITY,
        maxResults: Number.POSITIVE_INFINITY,
        perFile: Number.POSITIVE_INFINITY,
      };
    case "aggressive":
      // Layer 3: per-file count + one sample line.
      return { dedupe: true, aggregate: true };
    case "balanced":
    default:
      // Layers 1-2: dedup + default caps (per-file 25 / global 200 / 80-char window).
      return { dedupe: true };
  }
}

export const searchLikeHandler: CommandHandler = {
  name: "search-like",
  programs: ["rg", "grep"],

  matches(command) {
    return SEARCH_PROGRAMS.has(command.program);
  },

  execute(command) {
    const args = buildGrepArgs(command.program, command.args);
    const rewritten: ParsedCommand = {
      ...command,
      args,
      original: [command.program, ...args],
      displayCommand: `${command.program} ${args.join(" ")}`.trim(),
    };
    return executeCommand(rewritten);
  },

  async filter(raw, command, options) {
    const cleanedArgs = stripLevelFlags(command.args);
    const pattern = searchPattern(cleanedArgs);

    if (!raw.stdout.trim()) {
      const output = `${raw.stderr || `0 matches for ${pattern}`}\n`;
      return makeFilteredResult(this.name, raw, output, options);
    }

    // RTK: grep_cmd.rs — explicit format flags (-c/-l/-L/-o/-Z/--json) already
    // produce small/structured output and context flags (-A/-B/-C) were an explicit
    // request for surrounding lines, so both pass through verbatim. `--level none`
    // is an explicit opt-out (= --raw).
    const level = parseLevel(command.args, { fallback: "balanced" });
    if (hasFormatFlag(cleanedArgs) || hasContextFlag(cleanedArgs) || level === "none") {
      return makeFilteredResult(this.name, raw, `${raw.stdout.trimEnd()}\n`, options);
    }

    // Recovery contract item 3: when matches are suppressed, name how to recover.
    const recoveryHint = `# capped — \`tk --raw ${command.program} …\` for all, \`--level minimal\` for lossless`;
    const grouped = groupGrepOutput(raw.stdout, pattern, {
      ...grepOptionsForLevel(level),
      recoveryHint,
    });
    if (grouped === null) {
      return makeFilteredResult(this.name, raw, `${raw.stdout.trimEnd()}\n`, options);
    }

    // ADR 0001 decision 5: declare the reduction so the gate trusts it instead of
    // sniffing the grouped output's `[+N more]` marker as an UNDECLARED omission and
    // reverting the whole group back to raw — the search-like 0%-savings bug, where
    // a large `grep -r` shipped full raw despite a 200-line digest being ready.
    //
    // Declared `digest` (not `replacement`), mirroring read.ts's line-window choice:
    // a search's recovery channel is RE-EXECUTION (`tk --raw …`, named in the hint),
    // always available, not a raw snapshot. `replacement` would fail open to the full
    // raw search under --no-save-raw — reintroducing the exact bug this fixes — so
    // even a capped group declares digest; the `[+N more]` count keeps it honest.
    const omission: OmissionDeclaration = { kind: "digest" };
    return makeFilteredResult(this.name, raw, grouped, options, undefined, omission);
  },
};
