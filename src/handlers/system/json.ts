import { executeCommand } from "../../executor.js";
import type {
  CommandHandler,
  OmissionDeclaration,
  ParsedCommand,
  RawResult,
  TkOptions,
} from "../../types.js";
import { makeFilteredResult } from "../base.js";
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
    return `${indent}"${value}"`;
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

function formatJson(raw: RawResult): {
  output: string;
  error?: string;
  omission?: OmissionDeclaration;
} {
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

export const jsonHandler: CommandHandler = {
  name: "json",
  matches(command: ParsedCommand) {
    return command.program === "json";
  },
  execute(command) {
    return executeCommand(command);
  },
  async filter(raw, _command, options: TkOptions) {
    const { output, error, omission } = formatJson(raw);
    return makeFilteredResult(this.name, raw, output, options, error, omission);
  },
};
