// Slice 2 — failure handling for the `errorOccurred` event (DESIGN §3.4).
//
// On a tool failure the hook appends the SHORTEST recovery hint via
// `additionalContext` and never blocks (decision: allow). It records failure
// metrics only — no source code, no log text, no error message content. The error
// text is read solely to pick a hint category; it is never stored or echoed.

import type { Decision } from "./govern.js";
import type { ToolEvent } from "./normalize.js";

// Pull a lowercased error signal for classification ONLY. Not stored, not output.
function errorSignal(ev: ToolEvent): string {
  const input = ev.toolInput;
  const candidates = [
    ev.toolResult,
    (input.error as unknown),
    (input.errorMessage as unknown),
    (input.message as unknown),
    (input.stderr as unknown),
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 0) return c.toLowerCase();
  }
  return "";
}

// The shortest actionable hint for a failure. Chosen from the error signal and
// the tool category; never echoes the underlying text.
export function recoveryHint(ev: ToolEvent): string {
  const signal = errorSignal(ev);

  if (signal.includes("command not found") || signal.includes("not recognized") || signal.includes("is not recognized")) {
    return "Command not found — verify it is installed and on PATH before retrying.";
  }
  if (signal.includes("enoent") || signal.includes("no such file") || signal.includes("cannot find") || signal.includes("not found")) {
    return "Path not found — check the file or directory exists and the path is correct.";
  }
  if (signal.includes("permission denied") || signal.includes("eacces")) {
    return "Permission denied — check file permissions or your working directory.";
  }
  if (ev.category === "read" || ev.category === "list") {
    return "Read failed — confirm the path exists and is not in an ignored directory.";
  }
  return "The tool failed — re-read the error above before retrying; do not blindly re-run.";
}

export function handleError(ev: ToolEvent): Decision {
  return { decision: "allow", additional_context: recoveryHint(ev) };
}

// Whether this failure is a shell execution (for the history source_adapter).
export function failureSourceAdapter(ev: ToolEvent): "terminal_tool" | "direct_tool" {
  return ev.category === "execute_adjacent" ? "terminal_tool" : "direct_tool";
}
