import { executeCommand } from "../../executor.js";
import type { CommandHandler, RawResult } from "../../types.js";
import { makeFilteredResult, rawText } from "../base.js";

// RTK: system/summary.rs — `summary <cmd>` runs a command and emits a heuristic
// digest of its output. The output type is auto-detected (test/build/log/json/list/
// generic) and rendered under a "[ok]/[FAIL] Command: <cmd>" header.

// RTK: truncate.rs::CAP_WARNINGS = 12.
const MAX_SUMMARY_LIST = 12;
const MAX_SUMMARY_KEYS = 12;

// RTK: core/utils.rs::truncate — keep up to maxLen chars, else maxLen-3 + "...".
function truncate(text: string, maxLen: number): string {
  const chars = [...text];
  if (chars.length <= maxLen) return text;
  if (maxLen < 3) return "...";
  return `${chars.slice(0, maxLen - 3).join("")}...`;
}

type OutputType = "test" | "build" | "log" | "list" | "json" | "generic";

// RTK: summary.rs::detect_output_type.
function detectOutputType(output: string, command: string): OutputType {
  const cmdLower = command.toLowerCase();
  const outLower = output.toLowerCase();

  if (cmdLower.includes("test") || (outLower.includes("passed") && outLower.includes("failed"))) {
    return "test";
  }
  if (cmdLower.includes("build") || cmdLower.includes("compile") || outLower.includes("compiling")) {
    return "build";
  }
  if (outLower.includes("error:") || outLower.includes("warn:") || outLower.includes("[info]")) {
    return "log";
  }
  const trimmedStart = output.replace(/^\s+/, "");
  if (trimmedStart.startsWith("{") || trimmedStart.startsWith("[")) {
    return "json";
  }
  if (
    output.split("\n").every((line) => {
      if (line.length >= 200) return false;
      if (line.includes("\t")) return false;
      return line.split(/\s+/).filter(Boolean).length < 10;
    })
  ) {
    return "list";
  }
  return "generic";
}

// RTK: summary.rs::extract_number — first "<N> <after>" occurrence.
function extractNumber(text: string, after: string): number | undefined {
  const match = text.match(new RegExp(`(\\d+)\\s*${after}`));
  return match ? Number.parseInt(match[1] ?? "", 10) : undefined;
}

// RTK: summary.rs::summarize_tests.
function summarizeTests(output: string, result: string[]): void {
  result.push("Test Results:");

  let passed = 0;
  let failed = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const line of output.split("\n")) {
    const lower = line.toLowerCase();
    if (lower.includes("passed") || lower.includes("✓") || lower.includes("ok")) {
      const n = extractNumber(lower, "passed");
      if (n !== undefined) passed = n;
      else passed += 1;
    }
    if (lower.includes("failed") || lower.includes("[x]") || lower.includes("fail")) {
      const n = extractNumber(lower, "failed");
      if (n !== undefined) failed = n;
      if (!line.includes("0 failed")) failures.push(line);
    }
    if (lower.includes("skipped") || lower.includes("ignored")) {
      const n = extractNumber(lower, "skipped") ?? extractNumber(lower, "ignored");
      if (n !== undefined) skipped = n;
    }
  }

  result.push(`   [ok] ${passed} passed`);
  if (failed > 0) result.push(`   [FAIL] ${failed} failed`);
  if (skipped > 0) result.push(`   skip ${skipped} skipped`);

  if (failures.length > 0) {
    result.push("");
    result.push("   Failures:");
    for (const failure of failures.slice(0, 5)) {
      result.push(`   • ${truncate(failure, 70)}`);
    }
  }
}

// RTK: summary.rs::summarize_build.
function summarizeBuild(output: string, result: string[]): void {
  result.push("Build Summary:");

  let errors = 0;
  let warnings = 0;
  let compiled = 0;
  const errorMsgs: string[] = [];

  for (const line of output.split("\n")) {
    const lower = line.toLowerCase();
    if (lower.includes("error") && !lower.includes("0 error")) {
      errors += 1;
      if (errorMsgs.length < 5) errorMsgs.push(line);
    }
    if (lower.includes("warning") && !lower.includes("0 warning")) warnings += 1;
    if (lower.includes("compiling") || lower.includes("compiled")) compiled += 1;
  }

  if (compiled > 0) result.push(`   ${compiled} crates/files compiled`);
  if (errors > 0) result.push(`   [error] ${errors} errors`);
  if (warnings > 0) result.push(`   [warn] ${warnings} warnings`);
  if (errors === 0 && warnings === 0) result.push("   [ok] Build successful");

  if (errorMsgs.length > 0) {
    result.push("");
    result.push("   Errors:");
    for (const msg of errorMsgs) result.push(`   • ${truncate(msg, 70)}`);
  }
}

// RTK: summary.rs::summarize_logs_quick.
function summarizeLogs(output: string, result: string[]): void {
  result.push("Log Summary:");

  let errors = 0;
  let warnings = 0;
  let info = 0;

  for (const line of output.split("\n")) {
    const lower = line.toLowerCase();
    if (lower.includes("error") || lower.includes("fatal")) errors += 1;
    else if (lower.includes("warn")) warnings += 1;
    else if (lower.includes("info")) info += 1;
  }

  result.push(`   [error] ${errors} errors`);
  result.push(`   [warn] ${warnings} warnings`);
  result.push(`   [info] ${info} info`);
}

// RTK: summary.rs::summarize_list.
function summarizeList(output: string, result: string[]): void {
  const lines = output.split("\n").filter((line) => line.trim() !== "");
  result.push(`List (${lines.length} items):`);

  for (const line of lines.slice(0, MAX_SUMMARY_LIST)) {
    result.push(`   • ${truncate(line, 70)}`);
  }
  if (lines.length > MAX_SUMMARY_LIST) {
    result.push(`   ... +${lines.length - MAX_SUMMARY_LIST} more`);
  }
}

// RTK: summary.rs::summarize_json.
function summarizeJson(output: string, result: string[]): void {
  result.push("JSON Output:");

  let value: unknown;
  try {
    value = JSON.parse(output);
  } catch {
    result.push("   (Invalid JSON)");
    return;
  }

  if (Array.isArray(value)) {
    result.push(`   Array with ${value.length} items`);
  } else if (value && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    result.push(`   Object with ${keys.length} keys:`);
    for (const key of keys.slice(0, MAX_SUMMARY_KEYS)) result.push(`   • ${key}`);
    if (keys.length > MAX_SUMMARY_KEYS) {
      result.push(`   ... +${keys.length - MAX_SUMMARY_KEYS} more keys`);
    }
  } else {
    result.push(`   ${truncate(String(value), 100)}`);
  }
}

// RTK: summary.rs::summarize_generic.
function summarizeGeneric(output: string, result: string[]): void {
  const lines = output.split("\n");
  result.push("Output:");

  for (const line of lines.slice(0, 5)) {
    if (line.trim() !== "") result.push(`   ${truncate(line, 75)}`);
  }

  if (lines.length > 10) {
    result.push("   ...");
    for (const line of lines.slice(lines.length - 3)) {
      if (line.trim() !== "") result.push(`   ${truncate(line, 75)}`);
    }
  }
}

// RTK: summary.rs::summarize_output.
function summarizeOutput(output: string, command: string, success: boolean): string {
  const lines = output.split("\n");
  const result: string[] = [];

  const statusIcon = success ? "[ok]" : "[FAIL]";
  result.push(`${statusIcon} Command: ${truncate(command, 60)}`);
  result.push(`   ${lines.length} lines of output`);
  result.push("");

  switch (detectOutputType(output, command)) {
    case "test":
      summarizeTests(output, result);
      break;
    case "build":
      summarizeBuild(output, result);
      break;
    case "log":
      summarizeLogs(output, result);
      break;
    case "list":
      summarizeList(output, result);
      break;
    case "json":
      summarizeJson(output, result);
      break;
    default:
      summarizeGeneric(output, result);
  }

  return result.join("\n");
}

export const summaryHandler: CommandHandler = {
  name: "summary",
  matches(command) {
    return command.program === "summary" && command.args.length > 0;
  },
  execute(command) {
    return executeCommand({
      program: command.args[0] ?? "",
      args: command.args.slice(1),
      original: command.args,
      displayCommand: command.args.join(" "),
    });
  },
  async filter(raw: RawResult, command, options) {
    const summary = summarizeOutput(rawText(raw), command.args.join(" "), raw.exitCode === 0);
    return makeFilteredResult(this.name, raw, summary, options);
  },
};
