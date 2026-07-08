import type { ParsedCommand } from "../../types.js";
import { defineHandler } from "../define.js";

type TscIssue = {
  file: string;
  line: string;
  column: string;
  code: string;
  message: string;
  notes: string[];
};

// H13: file-less diagnostics are errors without a file:line prefix (e.g. TS6053
// "File 'x' not found", TS2307 "Cannot find module", TS5023 "Unknown compiler
// option"). Modelled on mypy.ts filelessErrors bucket.
type FilelessDiagnostic = { code: string; message: string; notes: string[] };

// ctx divergence (recorded in docs/align-rtk-divergences.md): RTK's tsc_cmd.rs emits
// a 39-char box-drawing separator under the summary line. ctx drops this decorative
// rule for tsc so that `npx tsc`, which re-dispatches through this same filter, stays
// within its tighter output budget. No tsc assertion pins the separator (unlike
// mypy/pip/format, which keep theirs), and dropping it only improves compression.

// Known package-runner programs that may wrap tsc as their first non-flag argument.
const TSC_RUNNERS = new Set(["npm", "pnpm", "yarn", "npx", "node"]);

// M17: `command.program.includes("tsc")` matched `mytscript.sh` (substring).
// Fixed to exact-name/suffix match. The `original` check covers package-runner
// wrappers but only when the program IS a known runner so that a random script
// that happens to pass "tsc" as an argument is not misrouted.
function matchesTsc(command: ParsedCommand): boolean {
  if (command.program === "tsc" || /(?:^|\/)tsc$/.test(command.program)) return true;
  if (TSC_RUNNERS.has(command.program)) {
    return command.original.slice(1).some((arg) => arg === "tsc");
  }
  return false;
}

function parseIssue(line: string): TscIssue | undefined {
  const match = line.match(/^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/);
  if (!match) return undefined;
  return {
    file: match[1] ?? "",
    line: match[2] ?? "",
    column: match[3] ?? "",
    code: match[4] ?? "",
    message: match[5] ?? "",
    notes: [],
  };
}

// H13: parse file-less diagnostics (no `file(line,col):` prefix) — e.g.
// "error TS6053: File 'foo.ts' not found."
// "error TS5023: Unknown compiler option 'strickt'."
function parseFileless(line: string): FilelessDiagnostic | undefined {
  const match = line.match(/^error\s+(TS\d+):\s+(.+)$/);
  if (!match) return undefined;
  return { code: match[1] ?? "", message: match[2] ?? "", notes: [] };
}

// RTK: tsc_cmd.rs::filter_tsc_output — group every diagnostic by file, show a
// single compact "Top codes" summary, and emit one line per error. Mirrors RTK's
// formatting (and compression) rather than duplicating a per-code breakdown.
function formatTsc(text: string): string {
  const issues: TscIssue[] = [];
  const fileless: FilelessDiagnostic[] = [];
  let lastIssue: TscIssue | FilelessDiagnostic | null = null;

  for (const line of text.split(/\r?\n/)) {
    const issue = parseIssue(line);
    if (issue) {
      issues.push(issue);
      lastIssue = issue;
      continue;
    }

    // H13: collect file-less diagnostics even when file errors also exist.
    const fl = parseFileless(line);
    if (fl) {
      fileless.push(fl);
      lastIssue = fl;
      continue;
    }

    if (/^\s{2,}\S/.test(line) && lastIssue !== null) {
      lastIssue.notes.push(line.trim());
    }
  }

  const totalErrors = issues.length + fileless.length;

  if (totalErrors === 0) {
    const trimmed = text.trim();
    // RTK: tsc_cmd.rs::filter_tsc_output / test_filter_no_errors — a clean run
    // collapses the "Found 0 errors" chatter into a single status line.
    if (/Found 0 errors/.test(trimmed)) return "TypeScript: No errors found\n";
    return trimmed ? `${trimmed}\n` : "";
  }

  const byFile = new Map<string, TscIssue[]>();
  for (const issue of issues) {
    const list = byFile.get(issue.file) ?? [];
    list.push(issue);
    byFile.set(issue.file, list);
  }

  // H13: reconcile the header count against tsc's own "Found N errors" line so
  // the two numbers agree even when the regex captures fewer/more diagnostics.
  const foundMatch = text.match(/Found (\d+) error/);
  const reportedTotal =
    foundMatch !== null && foundMatch[1] !== undefined
      ? Number.parseInt(foundMatch[1], 10)
      : totalErrors;
  const headerCount = Number.isNaN(reportedTotal) ? totalErrors : reportedTotal;

  const codeCounts = new Map<string, number>();
  for (const issue of [...issues, ...fileless]) {
    codeCounts.set(issue.code, (codeCounts.get(issue.code) ?? 0) + 1);
  }

  const out: string[] = [`TypeScript: ${headerCount} errors in ${byFile.size} files`];

  // RTK: top error codes on one line, highest count first, capped at 5.
  if (codeCounts.size > 1) {
    const topCodes = [...codeCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([code, count]) => `${code} (${count}x)`);
    out.push(`Top codes: ${topCodes.join(", ")}`, "");
  }

  // H13: file-less diagnostics shown first (they block all compilation, e.g.
  // TS6053 "File not found" prevents any file-level errors from being resolved).
  if (fileless.length > 0) {
    out.push("(no file)");
    for (const diag of fileless) {
      out.push(`  ${diag.code} ${diag.message}`);
      for (const note of diag.notes) out.push(`    ${note}`);
    }
    out.push("");
  }

  // RTK: files sorted by error count (most errors first); every error shown, no limit.
  const filesSorted = [...byFile.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
  for (const [file, fileIssues] of filesSorted) {
    out.push(`${file} (${fileIssues.length} errors)`);
    for (const issue of fileIssues) {
      // H13: full message, not truncated — error location detail in the message
      // must survive (was previously clipped at 120 chars with "...").
      out.push(`  L${issue.line}: ${issue.code} ${issue.message}`);
      for (const note of issue.notes) out.push(`    ${note}`);
    }
    out.push("");
  }

  return `${out.join("\n").trimEnd()}\n`;
}

export const tscHandler = defineHandler({
  name: "tsc",
  traits: { structural: true, cacheable: true, ttlClass: "medium" },
  programs: ["tsc"],

  match: matchesTsc,

  format: (raw, _command, options) => formatTsc(`${raw.stdout}\n${raw.stderr}`),
});
