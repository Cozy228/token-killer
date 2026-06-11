import type { ParsedArgv, ParsedCommand, TkOptions } from "./types.js";

// Default = "no cap": --max-lines/--max-chars are opt-in DISPLAY caps applied to the
// final compressed output (see core/outputLimit.ts). A finite default would silently
// truncate every output; the cap fires only when the user passes a finite value (H18).
const DEFAULT_MAX_LINES = Number.POSITIVE_INFINITY;
const DEFAULT_MAX_CHARS = Number.POSITIVE_INFINITY;

function defaultOptions(): TkOptions {
  return {
    raw: false,
    stats: false,
    maxLines: DEFAULT_MAX_LINES,
    maxChars: DEFAULT_MAX_CHARS,
    saveRaw: "auto",
    cwd: process.cwd(),
  };
}

function requireValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function parsePositiveInt(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer`);
  }
  return parsed;
}

// ADR 0009: validate a session id before it is trusted anywhere — history rows,
// dedup entries, and (critically) interpolation into a rewritten command string in
// hook/rewrite.ts. Anything outside this conservative charset is DROPPED (treated
// as no session), never escaped-in-place, so a hostile id can never inject shell
// syntax. Mirrors the identical guard in rewrite.ts.
const SESSION_ID_RE = /^[A-Za-z0-9._-]{1,128}$/;

export function sanitizeSessionId(raw: string | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;
  const trimmed = raw.trim();
  return SESSION_ID_RE.test(trimmed) ? trimmed : undefined;
}

function toCommand(tokens: string[]): ParsedCommand | undefined {
  if (tokens.length === 0) return undefined;
  return {
    program: tokens[0] ?? "",
    args: tokens.slice(1),
    original: tokens,
    displayCommand: tokens.join(" "),
  };
}

// Reserved subcommands intercepted BEFORE argv[0] is treated as a program, so a
// same-named program (e.g. a `shim`/`status` binary on PATH) can never reach the
// command router and a tk verb can never fall through to passthrough (U2).
// install / uninstall / status are first-class top-level verbs (U1+U2); `tk init`
// is gone (renamed to `tk install`) and is handled with a hint in cli.ts.
const RESERVED_SUBCOMMANDS = new Set<ParsedArgv["mode"]>([
  // Bare-word `help`/`version` are verbs too — without these, `tk help` fell through
  // to the command router and tried to passthrough a `help` program (only `tk --help`
  // worked). `tk -- help` still reaches a literal `help` program (the `--` escape hatch
  // is handled in the loop below, after this early return).
  "help",
  "version",
  "install",
  "uninstall",
  "status",
  "shim",
  "hook",
  "inspect",
  "debug",
  "optimize",
  "gain",
  "config",
  "telemetry",
]);

export function parseArgv(argv: string[]): ParsedArgv {
  const options = defaultOptions();
  let mode: ParsedArgv["mode"] = "command";
  let index = 0;

  const first = argv[0];
  // Measured savings live at `tk gain` (its own dispatcher). There is no proxy
  // report flag anymore — `tk gain` is the one report surface.
  if (first !== undefined && RESERVED_SUBCOMMANDS.has(first as ParsedArgv["mode"])) {
    return { mode: first as ParsedArgv["mode"], options, subArgs: argv.slice(1) };
  }

  while (index < argv.length) {
    const token = argv[index];

    if (token === "--") {
      index += 1;
      break;
    }

    if (token === "--raw") {
      options.raw = true;
      index += 1;
      continue;
    }
    if (token === "--stats") {
      options.stats = true;
      index += 1;
      continue;
    }
    if (token === "--max-lines") {
      options.maxLines = parsePositiveInt(requireValue(argv, index, token), token);
      index += 2;
      continue;
    }
    if (token === "--max-chars") {
      options.maxChars = parsePositiveInt(requireValue(argv, index, token), token);
      index += 2;
      continue;
    }
    if (token === "--session") {
      // Consume BOTH tokens so the wrapped tool never sees `--session <id>`. The
      // value is validated; an invalid id is ignored (falls back to TK_SESSION
      // below), but the tokens are still dropped from the command argv.
      const valid = sanitizeSessionId(requireValue(argv, index, token));
      if (valid) options.sessionId = valid;
      index += 2;
      continue;
    }
    if (token === "--save-raw") {
      options.saveRaw = true;
      index += 1;
      continue;
    }
    if (token === "--no-save-raw") {
      options.saveRaw = false;
      index += 1;
      continue;
    }
    if (token === "--help") {
      mode = "help";
      index += 1;
      continue;
    }
    if (token === "--version") {
      mode = "version";
      index += 1;
      continue;
    }

    break;
  }

  // Precedence: `--session` flag (set above) > `TK_SESSION` env > absent.
  options.sessionId ??= sanitizeSessionId(process.env.TK_SESSION);
  return {
    mode,
    options,
    command: mode === "command" ? toCommand(argv.slice(index)) : undefined,
  };
}
