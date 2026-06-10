// Shared compression dial across the read-like handlers (read / rg / tree).
//
// `--level` is the lossy dial, not a new flag family: it selects how many of the
// three compression layers (1: lossless re-encoding, 2: semantic-lossless caps,
// 3: lossy-but-recoverable truncation) a handler applies. Lower levels never drop
// more than higher ones (see docs/handler-compression-rg-tree-goal.md).
//
//   none        passthrough (= --raw), full verbatim
//   minimal     layer 1 only (dedup + prefix-factor), lossless — every entry kept
//   balanced    layers 1-2 + recoverable caps (default for rg/tree)
//   aggressive  layer 3 max (counts/sample only)
//
// `read` keeps its own per-language semantics under these names and supports only
// none/minimal/aggressive (no "balanced"); rg/tree add the cap tiers.
export type CompressionLevel = "none" | "minimal" | "balanced" | "aggressive";

const ALL_LEVELS: readonly CompressionLevel[] = [
  "none",
  "minimal",
  "balanced",
  "aggressive",
];

export function isCompressionLevel(value: string): value is CompressionLevel {
  return (ALL_LEVELS as readonly string[]).includes(value);
}

export type ParseLevelOptions = {
  // Returned when --level is absent or carries an unrecognized/disallowed value.
  fallback: CompressionLevel;
  // Restrict which levels this handler honors (read excludes "balanced").
  allowed?: readonly CompressionLevel[];
  // Honor `-l` as a level flag. Only `read` sets this: for rg `-l` is
  // --files-with-matches and for tree `-l` follows symlinks, so they parse the
  // long `--level`/`--level=` forms only.
  shortFlag?: boolean;
};

// Parse the `--level <value>` / `--level=<value>` (and optionally `-l <value>`)
// shape shared by all read-like handlers. The flag SHAPE parses identically
// everywhere; the `allowed` set is what differs per handler.
export function parseLevel(args: string[], options: ParseLevelOptions): CompressionLevel {
  const allowed = options.allowed ?? ALL_LEVELS;
  let result = options.fallback;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    // `--` ends option parsing; everything after is a positional (e.g. a literal
    // `--level` pattern for rg). Never interpret it as the level flag.
    if (arg === "--") break;
    let value: string | undefined;
    if (arg === "--level" || (options.shortFlag === true && arg === "-l")) {
      value = args[index + 1];
      index += 1;
    } else if (arg?.startsWith("--level=")) {
      value = arg.slice("--level=".length);
    } else {
      continue;
    }
    if (value !== undefined && isCompressionLevel(value) && allowed.includes(value)) {
      result = value;
    }
  }
  return result;
}

// Drop `--level`/`--level=` tokens before an invocation is handed to the real
// binary (rg/tree do not understand `--level`). `-l` is never stripped — it is a
// genuine rg/tree flag, and the only handler that reads `-l` as a level (`read`)
// reconstructs its argv from file operands instead of stripping.
export function stripLevelFlags(args: string[]): string[] {
  const out: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    // `--` ends option parsing — preserve it and every following arg verbatim so
    // a literal `--level` pattern (and its neighbours) is never dropped.
    if (arg === "--") {
      out.push(...args.slice(index));
      break;
    }
    if (arg === "--level") {
      index += 1;
      continue;
    }
    if (arg?.startsWith("--level=")) continue;
    if (arg !== undefined) out.push(arg);
  }
  return out;
}
