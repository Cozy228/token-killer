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

// rg's `-r/--replace` takes a VALUE and rewrites every match with it — but grep
// users reach for `-r` as the *recursive* flag (`rg -rn pattern`), which rg
// silently parses as `--replace=n`, corrupting every match into the literal `n`
// (a real correctness footgun seen repeatedly in dogfood). rg already recurses
// by default, so a replace value that is just grep-style flag letters is almost
// certainly this mistake. We detect it and surface a warning — WITHOUT changing
// what rg runs (the value really was passed; ctx only annotates the output).
//
// grep is excluded on purpose: there `-r` genuinely is recursive.
const GREP_FLAG_LETTERS = new Set([
  "n",
  "i",
  "l",
  "L",
  "c",
  "o",
  "w",
  "v",
  "H",
  "h",
  "s",
  "a",
  "E",
  "F",
  "R",
  "r",
]);

function isFlagLetters(value: string): boolean {
  return /^[a-zA-Z]+$/.test(value) && [...value].every((char) => GREP_FLAG_LETTERS.has(char));
}

// Returns the misused replacement value (e.g. "n" for `-rn`) when a `-r` looks
// like a grep-recursive slip, else null. Cluster forms (`-rn`, `-rni`) are
// high-confidence; the separate-arg form (`-r n`) only fires on a single
// flag-letter so an intentional `rg -r foo` / `rg -r '$1'` is left alone.
export function detectReplaceFootgun(program: string, args: string[]): string | null {
  if (program !== "rg") return null;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    let value: string | undefined;
    let fromCluster = false;
    if (arg === "-r" || arg === "--replace") {
      value = args[index + 1];
    } else if (arg.startsWith("--replace=")) {
      value = arg.slice("--replace=".length);
    } else if (/^-[^-]*r/.test(arg)) {
      // Short-flag cluster containing `r`. rg consumes the cluster remainder
      // after `r` as the value; if `r` is last, the value is the next arg.
      const afterR = arg.slice(arg.indexOf("r") + 1);
      if (afterR.length > 0) {
        value = afterR;
        fromCluster = true;
      } else {
        value = args[index + 1];
      }
    } else {
      continue;
    }
    if (value === undefined) value = "";
    if (fromCluster) {
      if (value === "" || isFlagLetters(value)) return value;
    } else if (value === "" || (value.length === 1 && isFlagLetters(value))) {
      return value;
    }
    return null; // a `-r` carrying a real replacement string — leave it alone.
  }
  return null;
}

function replaceFootgunWarning(value: string): string {
  const shown = value === "" ? "" : ` with "${value}"`;
  return (
    `# ⚠ rg \`-r\`/\`--replace\` rewrote every match${shown} — it is NOT grep's ` +
    "recursive flag (rg already recurses). If you meant a recursive search, drop " +
    "`-r` (e.g. `rg -n <pattern> <path>`)."
  );
}

// The advisory line for a misused `rg -r`, or null when the invocation is clean.
// Shared by the handler (digest banner) and the `--raw` path (stderr advisory) so
// the warning surfaces in both verbatim and compressed modes.
export function replaceFootgunBanner(program: string, args: string[]): string | null {
  const value = detectReplaceFootgun(program, args);
  return value === null ? null : replaceFootgunWarning(value);
}

// RTK: grep_cmd.rs::run — RTK re-invokes the search with `-nH` so every match is
// emitted as `file:line:content`, which is what the grouping parser needs. A raw
// `grep -r pattern dir` omits line numbers (and, for a single file, the filename),
// so ctx cannot group it and falls back to passthrough (0% savings). Forcing `-n`
// and `-H` restores the parseable shape, and the per-file / global caps then
// compress a large recursive search.
//
// rg IS rewritten too (parity with RTK's real behavior): piped to a non-TTY, `rg`
// OMITS line numbers by default, so its output is unparseable and falls back to
// passthrough (0% savings). Forcing `-n -H --no-heading` restores
// `file:line:content`. Deliberate divergence from RTK: ctx does NOT add
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
  traits: { cacheable: true, ttlClass: "fast" },
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
    // Do NOT forward ctx's stdin: ripgrep with no path operand reads a readable-pipe
    // stdin instead of recursing the cwd, so the empty pipe ctx would hand it makes
    // `ctx rg PATTERN` (and `-g`/`--glob` forms) report a false "0 matches". A
    // /dev/null stdin makes rg/grep recurse the cwd like a direct invocation.
    return executeCommand(rewritten, undefined, { forwardStdin: false });
  },

  async filter(raw, command, options) {
    const cleanedArgs = stripLevelFlags(command.args);
    const pattern = searchPattern(cleanedArgs);

    // Correctness guard (banner only — rg already ran verbatim): flag a `rg -rn`-style
    // slip that silently replaced matches instead of recursing. Passed as the banner
    // arg so it survives a revert-to-raw and never trips the inflation gate itself.
    const banner = replaceFootgunBanner(command.program, cleanedArgs) ?? undefined;

    // M6-grep fix: -q/--quiet/--silent passthrough — exit 0 means FOUND, exit 1
    // means not-found. Fabricating "0 matches for <pattern>" on an empty-stdout
    // success is wrong (it means the pattern WAS found). Format-flag passthrough
    // must be checked BEFORE the empty-stdout guard.
    const level = parseLevel(command.args, { fallback: "balanced" });
    if (hasFormatFlag(cleanedArgs) || hasContextFlag(cleanedArgs) || level === "none") {
      // Null-delimited output (`-Z`/`--null`/`-z`) frames entries with \0; appending
      // the normalizing trailing \n corrupts that framing — native GNU grep `-lZ`
      // ends exactly at the final \0, so the extra \n broke byte-exact parity (it
      // happened to match BSD grep locally, hiding the bug). Pass \0 output verbatim.
      const out = raw.stdout.includes("\0") ? raw.stdout : `${raw.stdout.trimEnd()}\n`;
      return makeFilteredResult(this, raw, out, options, undefined, undefined, banner);
    }

    if (!raw.stdout.trim()) {
      const output = `${raw.stderr || `0 matches for ${pattern}`}\n`;
      return makeFilteredResult(this, raw, output, options, undefined, undefined, banner);
    }

    // Recovery contract item 3: when matches are suppressed, name how to recover.
    // M7-grep fix: ADR 0001 d6 bans `ctx --raw` re-run hints (a re-run would
    // re-fire side-effecting commands like POST requests). Recovery is via the
    // raw snapshot the gate persists (rawPointer) or `--level minimal` for a
    // lossless group.
    const recoveryHint = `# capped — use \`--level minimal\` for lossless or see rawPointer for full output`;
    const grouped = groupGrepOutput(raw.stdout, pattern, {
      ...grepOptionsForLevel(level),
      recoveryHint,
    });
    if (grouped === null) {
      return makeFilteredResult(
        this,
        raw,
        `${raw.stdout.trimEnd()}\n`,
        options,
        undefined,
        undefined,
        banner,
      );
    }

    // ADR 0001 decision 5: declare the reduction so the gate trusts it instead of
    // sniffing the grouped output's `[+N more]` marker as an UNDECLARED omission and
    // reverting the whole group back to raw — the search-like 0%-savings bug, where
    // a large `grep -r` shipped full raw despite a 200-line digest being ready.
    //
    // The kind is `digest` when the grouping only de-dups/caps matches (all match
    // content preserved within cap), or `replacement` when content was truncated
    // (80-char window is lossy). The groupGrepOutput function signals this via the
    // suppressed flag — when content was truncated, it appended the recoveryHint.
    // Since we cannot distinguish the two cases after the fact here without
    // duplicating state, we use `digest` consistently as before: the gate trusts
    // it, force-persists raw, and appends a snapshot pointer that covers the
    // content-truncation case too. `replacement` would fail open to raw under
    // --no-save-raw, breaking the primary compression path.
    const omission: OmissionDeclaration = { kind: "digest" };
    return makeFilteredResult(this, raw, grouped, options, undefined, omission, banner);
  },
};
