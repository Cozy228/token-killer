import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TkOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

// RTK: system/json_cmd.rs — inspect/compact JSON to save tokens on large payloads.
//   `rtk json <file>` reads the file and, by default (no --schema/--keys-only),
//   emits the compact form: sorted object keys with values, long strings
//   truncated, arrays summarized. The tk handler mirrors this by compacting the
//   JSON content carried in raw.stdout.
//
// Two RTK reductions are intentionally NOT reachable through this handler:
//   - validate_json_extension(): RTK rejects toml/yaml/xml/csv/ini/env/txt before
//     I/O. By the time tk sees raw.stdout the command already ran, so extension
//     gating happens upstream; we mirror only the content compaction here.
//   - filter_json_string() (--schema, types-only): a separate flag-gated path. The
//     default `json <file>` invocation uses filter_json_compact, which is what we
//     port below.

const MAX_DEPTH = 5; // RTK default max_depth for `rtk json` (json_cmd.rs run()).
const STRING_TRUNCATE_LEN = 80; // RTK: compact_json String arm (s.len() > 80).
const STRING_TRUNCATE_KEEP = 77; // RTK: floor_char_boundary(77) before "...".
const ARRAY_INLINE_MAX = 5; // RTK: arr.len() > 5 collapses to "[first, ... +N more]".
const OBJECT_KEY_LIMIT = 20; // RTK: i >= 20 emits "... +N more keys".

type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

function isSimple(value: JsonValue): boolean {
  // RTK: matches!(v, Null | Bool | Number | String).
  return (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  );
}

// RTK: compact_json String arm uses s.floor_char_boundary(77) so multibyte
// strings never split mid-codepoint. Array.from() iterates by code point, which
// keeps the kept slice on a character boundary like Rust's floor_char_boundary.
function truncateString(s: string): string {
  if (s.length <= STRING_TRUNCATE_LEN) {
    return `"${s}"`;
  }
  // Keep at most STRING_TRUNCATE_KEEP UTF-16 units, never splitting a surrogate
  // pair (the JS analogue of Rust's char-boundary flooring).
  let end = STRING_TRUNCATE_KEEP;
  if (end > 0 && end < s.length) {
    const code = s.charCodeAt(end);
    // 0xDC00-0xDFFF is a low surrogate: stepping back keeps the pair intact.
    if (code >= 0xdc00 && code <= 0xdfff) {
      end -= 1;
    }
  }
  return `"${s.slice(0, end)}..."`;
}

// RTK: json_cmd.rs::compact_json — depth-bounded compaction with values.
function compactJson(value: JsonValue, depth: number, maxDepth: number): string {
  const indent = "  ".repeat(depth);

  if (depth > maxDepth) {
    return `${indent}...`;
  }

  if (value === null) {
    return `${indent}null`;
  }
  if (typeof value === "boolean") {
    return `${indent}${value ? "true" : "false"}`;
  }
  if (typeof value === "number") {
    // RTK prints numbers via serde_json::Number's Display. JSON.parse already
    // collapses 1.0 -> 1, so String(n) reproduces the same integer/float text.
    return `${indent}${String(value)}`;
  }
  if (typeof value === "string") {
    return `${indent}${truncateString(value)}`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${indent}[]`;
    }
    if (value.length > ARRAY_INLINE_MAX) {
      const first = compactJson(value[0]!, depth + 1, maxDepth);
      return `${indent}[${first.trim()}, ... +${value.length - 1} more]`;
    }
    const items = value.map((v) => compactJson(v, depth + 1, maxDepth));
    const allSimple = value.every(isSimple);
    if (allSimple) {
      const inline = items.map((s) => s.trim());
      return `${indent}[${inline.join(", ")}]`;
    }
    const lines = [`${indent}[`];
    for (const item of items) {
      lines.push(`${item},`);
    }
    lines.push(`${indent}]`);
    return lines.join("\n");
  }

  // Object
  const keys = Object.keys(value);
  if (keys.length === 0) {
    return `${indent}{}`;
  }
  // RTK sorts keys (serde_json BTreeMap-style sort via keys.sort()).
  keys.sort();
  const lines = [`${indent}{`];
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]!;
    const val = value[key]!;
    if (isSimple(val)) {
      const valStr = compactJson(val, 0, maxDepth);
      lines.push(`${indent}  ${key}: ${valStr.trim()}`);
    } else {
      lines.push(`${indent}  ${key}:`);
      lines.push(compactJson(val, depth + 1, maxDepth));
    }
    if (i >= OBJECT_KEY_LIMIT) {
      lines.push(`${indent}  ... +${keys.length - i - 1} more keys`);
      break;
    }
  }
  lines.push(`${indent}}`);
  return lines.join("\n");
}

// RTK: json_cmd.rs::filter_json_compact — parse then compact_json(value, 0, max_depth).
function filterJsonCompact(jsonStr: string, maxDepth: number): string | undefined {
  let value: JsonValue;
  try {
    value = JSON.parse(jsonStr) as JsonValue;
  } catch {
    return undefined; // RTK bails with "Failed to parse JSON"; tk falls back to raw.
  }
  return compactJson(value, 0, maxDepth);
}

function formatJson(raw: RawResult): { output: string; error?: string } {
  const compacted = filterJsonCompact(raw.stdout, MAX_DEPTH);
  if (compacted === undefined) {
    // Fallback: leave raw untouched (RTK's filter-fail-then-passthrough contract).
    return { output: raw.stdout, error: "Failed to parse JSON" };
  }
  return { output: `${compacted}\n` };
}

export const jsonHandler: CommandHandler = {
  name: "json",
  matches(command: ParsedCommand) {
    return command.program === "json";
  },
  execute(command) {
    return executeCommand(command);
  },
  async filter(raw, _command, options: TkOptions) {
    const { output, error } = formatJson(raw);
    return makeFilteredResult(this.name, raw, output, options, error);
  },
};
