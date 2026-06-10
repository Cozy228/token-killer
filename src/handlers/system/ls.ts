import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TkOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

// RTK: system/ls.rs — parse `ls -la` long format into a compact listing:
// dirs first (name + "/"), then files (name + human size), NOISE_DIRS filtered
// unless -a, optional octal perms prefix with -l. The Rust summary line is only
// emitted in interactive TTY mode (ls.rs::run is_terminal()); when piped (which
// is how tk consumes output) only the entries are returned, so we mirror that.

// RTK: system/constants.rs::NOISE_DIRS.
const NOISE_DIRS = [
  "node_modules",
  ".git",
  "target",
  "__pycache__",
  ".next",
  "dist",
  "build",
  ".cache",
  ".turbo",
  ".vercel",
  ".pytest_cache",
  ".mypy_cache",
  ".tox",
  ".venv",
  "venv",
  "env",
  "coverage",
  ".nyc_output",
  ".DS_Store",
  "Thumbs.db",
  ".idea",
  ".vscode",
  ".vs",
  "*.egg-info",
  ".eggs",
];

// RTK: ls.rs::LS_DATE_RE — anchors on the `Mon DD HH:MM` / `Mon DD  YYYY` date
// field so owner/group columns containing spaces do not break parsing.
const LS_DATE_RE =
  /\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+(?:\d{4}|\d{2}:\d{2})\s+/;

// RTK: ls.rs::human_size.
function humanSize(bytes: number): string {
  if (bytes >= 1_048_576) {
    return `${(bytes / 1_048_576).toFixed(1)}M`;
  }
  if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)}K`;
  }
  return `${bytes}B`;
}

// RTK: ls.rs::is_dotdir — `.` and `..` entries carry no content.
function isDotdir(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.endsWith(".") && (trimmed.endsWith("..") || trimmed.endsWith(" .") || trimmed === ".")
  );
}

type LsLine = { fileType: string; perms: string; size: number; name: string };

// RTK: ls.rs::parse_ls_line — locate the date anchor, take everything after it
// as the name, scan the columns before it from the right for the size field.
function parseLsLine(line: string): LsLine | undefined {
  if (isDotdir(line)) {
    return undefined;
  }

  const dateMatch = LS_DATE_RE.exec(line);
  if (!dateMatch) {
    return undefined;
  }

  const name = line.slice(dateMatch.index + dateMatch[0].length);
  const beforeDate = line.slice(0, dateMatch.index);
  const beforeParts = beforeDate.split(/\s+/).filter((p) => p !== "");
  if (beforeParts.length < 4) {
    return undefined;
  }

  const perms = beforeParts[0]!;
  const fileType = perms.charAt(0);

  // Size is the rightmost parseable integer before the date (nlinks appears
  // earlier, so scanning from the end hits the size field first).
  let size = 0;
  for (let i = beforeParts.length - 1; i >= 0; i -= 1) {
    const part = beforeParts[i]!;
    if (/^\d+$/.test(part)) {
      size = Number.parseInt(part, 10);
      break;
    }
  }

  return { fileType, perms, size, name };
}

// RTK: ls.rs::perms_to_octal — `-rw-r--r--` → "644", `drwxrwxrwt` → "1777".
function permsToOctal(perms: string): string | undefined {
  // eslint-disable-next-line no-control-regex
  if (perms.length < 10 || /[^\x00-\x7f]/.test(perms)) {
    return undefined;
  }
  const b = perms;

  const permValue = (read: boolean, write: boolean, exec: boolean): number =>
    ((read ? 1 : 0) << 2) | ((write ? 1 : 0) << 1) | (exec ? 1 : 0);

  const ownerX = b[3] === "x" || b[3] === "s";
  const groupX = b[6] === "x" || b[6] === "s";
  const otherX = b[9] === "x" || b[9] === "t";

  const owner = permValue(b[1] === "r", b[2] === "w", ownerX);
  const group = permValue(b[4] === "r", b[5] === "w", groupX);
  const other = permValue(b[7] === "r", b[8] === "w", otherX);

  const setuid = b[3] === "s" || b[3] === "S";
  const setgid = b[6] === "s" || b[6] === "S";
  const sticky = b[9] === "t" || b[9] === "T";
  const special = permValue(setuid, setgid, sticky);

  if (special > 0) {
    return `${special}${owner}${group}${other}`;
  }
  return `${owner}${group}${other}`;
}

type LsArgs = { showAll: boolean; showLong: boolean };

// RTK: ls.rs::run — `-a`/`--all` enables show_all; `-l`/`-g`/`-n`/`-o`,
// `--full-time`, `--format=long`, `--format=verbose` enable the long listing.
function parseLsArgs(args: string[]): LsArgs {
  const showAll = args.some(
    (a) => (a.startsWith("-") && !a.startsWith("--") && a.includes("a")) || a === "--all",
  );
  const showLong = args.some((a) => {
    if (a === "--full-time" || a === "--format=long" || a === "--format=verbose") {
      return true;
    }
    if (a.startsWith("-") && !a.startsWith("--")) {
      return [...a].some((c) => c === "l" || c === "g" || c === "n" || c === "o");
    }
    return false;
  });
  return { showAll, showLong };
}

// RTK: ls.rs::compact_ls — dirs first (with `/`), then files (with human size),
// NOISE_DIRS filtered unless show_all, octal prefix only when show_long.
function compactLs(raw: string, showAll: boolean, showLong: boolean): string {
  const dirs: Array<{ name: string; octal?: string }> = [];
  const files: Array<{ name: string; size: string; octal?: string }> = [];
  // H17: track names of hidden tool dirs for the disclosure line.
  const hiddenToolDirs: string[] = [];
  let linesSeen = 0;
  let parsedCount = 0;
  let dotdirs = 0;

  for (const line of raw.split("\n")) {
    if (line.startsWith("total ") || line === "") {
      continue;
    }
    linesSeen += 1;

    const parsed = parseLsLine(line);
    if (!parsed) {
      if (isDotdir(line)) {
        dotdirs += 1;
      }
      continue;
    }
    parsedCount += 1;

    if (!showAll && NOISE_DIRS.some((noise) => parsed.name === noise)) {
      // H17: count hidden dirs so the disclosure line can be appended below.
      hiddenToolDirs.push(parsed.name);
      continue;
    }

    const octal = showLong ? permsToOctal(parsed.perms) : undefined;

    if (parsed.fileType === "d") {
      dirs.push({ name: parsed.name, octal });
    } else {
      files.push({ name: parsed.name, size: humanSize(parsed.size), octal });
    }
  }

  if (dirs.length === 0 && files.length === 0) {
    if (linesSeen > 0 && parsedCount === 0) {
      if (dotdirs === linesSeen) {
        return "(empty)\n";
      }
      // Real content that couldn't be parsed (e.g. non-English locale).
      return "";
    }
    // H17: if every visible entry was a hidden tool dir, still emit the disclosure
    // line rather than "(empty)" so the agent knows they exist.
    if (hiddenToolDirs.length > 0) {
      return `(+${hiddenToolDirs.length} tool dirs hidden: ${hiddenToolDirs.join(", ")} — use -a)\n`;
    }
    return "(empty)\n";
  }

  let entries = "";
  for (const dir of dirs) {
    if (dir.octal) {
      entries += `${dir.octal}  `;
    }
    entries += `${dir.name}/\n`;
  }
  for (const file of files) {
    if (file.octal) {
      entries += `${file.octal}  `;
    }
    entries += `${file.name}  ${file.size}\n`;
  }
  // H17: emit one declared disclosure line so the agent knows build/tool dirs exist.
  // Never silent — "did the build emit dist/?" needs a truthful answer.
  if (hiddenToolDirs.length > 0) {
    entries += `(+${hiddenToolDirs.length} tool dirs hidden: ${hiddenToolDirs.join(", ")} — use -a)\n`;
  }
  return entries;
}

function formatLs(raw: RawResult, command: ParsedCommand): string {
  const { showAll, showLong } = parseLsArgs(command.args);
  const compacted = compactLs(raw.stdout, showAll, showLong);

  // RTK: ls.rs::run — if nothing parsed but the directory has real content,
  // fall back to raw output rather than emitting "(empty)".
  const hasRealContent = raw.stdout
    .split("\n")
    .some((l) => !l.startsWith("total ") && l !== "" && !isDotdir(l));
  if (compacted === "" && hasRealContent) {
    return raw.stdout;
  }
  return compacted;
}

// RTK: ls.rs::run command construction — always run `ls -la` (long+all) so the
// filter has perms/size/name columns to parse, regardless of the user's flags.
// Combined short flags keep only their non-l/a/h extras; `--all` is dropped (the
// filter re-applies noise filtering based on the user's original intent); long
// `--` flags pass through; paths are preserved (default "."). The user's original
// flags still drive show_all/show_long in the filter (parseLsArgs(command.args)).
export function buildLsArgs(userArgs: string[]): string[] {
  const flags = userArgs.filter((a) => a.startsWith("-"));
  const paths = userArgs.filter((a) => !a.startsWith("-"));
  const out = ["-la"];
  for (const flag of flags) {
    if (flag.startsWith("--")) {
      if (flag !== "--all") out.push(flag);
    } else {
      // Array.from (not a `[...str]` spread) so oxlint --fix can't strip the
      // string-to-chars conversion and leave .filter on a string.
      const extra = Array.from(flag.slice(1))
        .filter((c) => c !== "l" && c !== "a" && c !== "h")
        .join("");
      if (extra !== "") out.push(`-${extra}`);
    }
  }
  out.push(...(paths.length > 0 ? paths : ["."]));
  return out;
}

export const lsHandler: CommandHandler = {
  name: "ls",
  traits: { cacheable: true, ttlClass: "fast" },
  programs: ["ls"],
  matches(command) {
    return command.program === "ls";
  },
  execute(command) {
    // RTK: ls.rs::run — force `ls -la` under LC_ALL=C so the long-format parser works.
    const rewritten: ParsedCommand = {
      ...command,
      args: buildLsArgs(command.args),
      original: ["ls", ...buildLsArgs(command.args)],
      displayCommand: `ls ${buildLsArgs(command.args).join(" ")}`,
    };
    return executeCommand(rewritten, { LC_ALL: "C" });
  },
  async filter(raw, command, options: TkOptions) {
    // C2-ls: nonzero exit (e.g. "No such file or directory") must never render
    // "(empty)" — return the raw streams so the error message survives.
    if (raw.exitCode !== 0) {
      return makeFilteredResult(this, raw, `${raw.stdout}${raw.stderr}`, options);
    }
    return makeFilteredResult(this, raw, formatLs(raw, command), options);
  },
};
