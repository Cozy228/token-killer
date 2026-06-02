import type { ParsedArgv, ParsedCommand, TgOptions } from "./types.js";

const DEFAULT_MAX_LINES = 120;
const DEFAULT_MAX_CHARS = 12000;

function defaultOptions(): TgOptions {
  return {
    raw: false,
    stats: false,
    verbose: false,
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

function toCommand(tokens: string[]): ParsedCommand | undefined {
  if (tokens.length === 0) return undefined;
  return {
    program: tokens[0] ?? "",
    args: tokens.slice(1),
    original: tokens,
    displayCommand: tokens.join(" "),
  };
}

export function parseArgv(argv: string[]): ParsedArgv {
  const options = defaultOptions();
  let mode: ParsedArgv["mode"] = "command";
  let index = 0;

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
    if (token === "--verbose") {
      options.verbose = true;
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
    if (token === "--report") {
      mode = "report";
      index += 1;
      continue;
    }
    if (token === "--json") {
      options.reportFormat = "json";
      index += 1;
      continue;
    }
    if (token === "--csv") {
      options.reportFormat = "csv";
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

  options.reportFormat ??= "text";
  return {
    mode,
    options,
    command: mode === "command" ? toCommand(argv.slice(index)) : undefined,
  };
}
