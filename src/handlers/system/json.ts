import type { OmissionDeclaration, ParsedCommand, RawResult } from "../../types.js";
import { defineHandler } from "../define.js";
import { withinBudget } from "../common/budget.js";

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

// ADR 0001: every RTK reduction here was evidence-capping. The count/depth caps
// (ARRAY_INLINE_MAX=5, OBJECT_KEY_LIMIT=20, MAX_DEPTH=5) dropped array elements,
// object keys, and whole nested subtrees behind a `+N more` / `...` marker; the
// per-string head-truncation (>80 chars → `"…"`) silently dropped string CONTENT
// even when the payload as a whole fit the budget. All are removed: below the
// token budget the compact view is rendered in FULL — every element, every key,
// every level, every string byte (zero loss). Over budget the handler declares a
// complete-replacement summary and the gate persists + points at the snapshot.

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function isSimple(value: JsonValue): boolean {
  // RTK: matches!(v, Null | Bool | Number | String).
  return (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  );
}

// Compact JSON to an indented `key: value` view, in full — every element, key,
// nesting level, and string byte is kept (ADR 0001: no count/depth/string caps).
// The over-budget decision is made once, at the top level (formatJson), on the
// rendered size, so nothing is dropped while the payload still fits the budget.
// Guards against a RangeError stack overflow on pathologically nested JSON (the
// old MAX_DEPTH=5 cap was removed for losslessness, audit #8). `stackDepth` counts
// real recursion (unlike `depth`, the indent level, which resets to 0 for inline
// simple values). When exceeded we throw; formatJson treats that as "over budget →
// replacement summary" so the payload stays recoverable via the snapshot.
const MAX_SAFE_DEPTH = 500;

function compactJson(value: JsonValue, depth: number, stackDepth = 0): string {
  if (stackDepth > MAX_SAFE_DEPTH) {
    throw new RangeError("json: nesting too deep to render safely");
  }
  const indent = "  ".repeat(depth);

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
    // M10-json: escape embedded newlines so line-based consumers never see a
    // string value that spans multiple lines and breaks the compact format.
    const escaped = value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
    return `${indent}"${escaped}"`;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return `${indent}[]`;
    }
    const items = value.map((v) => compactJson(v, depth + 1, stackDepth + 1));
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
  for (const key of keys) {
    const val = value[key]!;
    if (isSimple(val)) {
      const valStr = compactJson(val, 0, stackDepth + 1);
      lines.push(`${indent}  ${key}: ${valStr.trim()}`);
    } else {
      lines.push(`${indent}  ${key}:`);
      lines.push(compactJson(val, depth + 1, stackDepth + 1));
    }
  }
  lines.push(`${indent}}`);
  return lines.join("\n");
}

// ADR 0001 step-2 complete-replacement summary for an over-budget payload: a
// shape-only aggregate, never a partial listing. The snapshot pointer is appended
// by makeFilteredResult.
function jsonReplacementSummary(value: JsonValue): string {
  if (Array.isArray(value)) {
    return `JSON array: ${value.length} items (over budget)\n`;
  }
  if (value !== null && typeof value === "object") {
    return `JSON object: ${Object.keys(value).length} keys (over budget)\n`;
  }
  return `JSON: scalar value (over budget)\n`;
}

// M10-json: detect big integers in the raw JSON text. JSON.parse uses IEEE 754
// double, which cannot represent integers > Number.MAX_SAFE_INTEGER exactly —
// 9007199254740993 becomes 9007199254740992 silently. Detect any integer literal
// in the source that exceeds MAX_SAFE_INTEGER and fall back to raw output.
const BIG_INT_RE = /(?<!["\w.])(\d{16,})(?![\d".])/;
function hasBigInteger(text: string): boolean {
  const match = BIG_INT_RE.exec(text);
  if (!match) return false;
  // Check if any matched run of 16+ digits exceeds MAX_SAFE_INTEGER.
  return BigInt(match[1]!) > BigInt(Number.MAX_SAFE_INTEGER);
}

function formatJson(raw: RawResult): {
  output: string;
  error?: string;
  omission?: OmissionDeclaration;
} {
  // M10-json: big-integer guard — if the payload contains integers that would be
  // corrupted by JSON.parse, return raw rather than emitting wrong numbers.
  if (hasBigInteger(raw.stdout)) {
    return { output: raw.stdout, error: "JSON: skipped (64-bit integer present)" };
  }

  let value: JsonValue;
  try {
    value = JSON.parse(raw.stdout) as JsonValue;
  } catch {
    // RTK's filter-fail-then-passthrough contract: leave raw untouched.
    return { output: raw.stdout, error: "Failed to parse JSON" };
  }
  let full: string;
  try {
    full = `${compactJson(value, 0)}\n`;
  } catch (error) {
    // Only the depth guard's RangeError (and a native "Maximum call stack" overflow,
    // also a RangeError) degrades to the shape-only replacement — recoverable via the
    // snapshot. ANY other unexpected throw propagates so the pipeline fails open to
    // raw, rather than silently shipping a lossy summary that would hide a real bug.
    if (error instanceof RangeError) {
      return { output: jsonReplacementSummary(value), omission: { kind: "replacement" } };
    }
    throw error;
  }
  if (withinBudget(full)) return { output: full };
  // No lossless digest step for arbitrary JSON structure → straight to step 2.
  return { output: jsonReplacementSummary(value), omission: { kind: "replacement" } };
}

export const jsonHandler = defineHandler({
  name: "json",
  traits: { structural: true, ladder: true },
  match(command: ParsedCommand) {
    return command.program === "json";
  },
  format: (raw) => {
    const { output, error, omission } = formatJson(raw);
    return { output, omission, filterError: error };
  },
});
