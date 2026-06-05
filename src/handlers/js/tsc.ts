import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";

type TscIssue = {
  file: string;
  line: string;
  column: string;
  code: string;
  message: string;
  notes: string[];
};

// tk divergence (recorded in docs/align-rtk-divergences.md): RTK's tsc_cmd.rs emits
// a 39-char box-drawing separator under the summary line. tk drops this decorative
// rule for tsc so that `npx tsc`, which re-dispatches through this same filter, stays
// within its tighter output budget. No tsc assertion pins the separator (unlike
// mypy/pip/format, which keep theirs), and dropping it only improves compression.

function matchesTsc(command: ParsedCommand): boolean {
  return command.program.includes("tsc") || command.original.includes("tsc");
}

// RTK: core/utils.rs::truncate — keep up to max chars, else 117 chars + "...".
function truncate(text: string, maxLen: number): string {
  const chars = [...text];
  if (chars.length <= maxLen) return text;
  if (maxLen < 3) return "...";
  return `${chars.slice(0, maxLen - 3).join("")}...`;
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

// RTK: tsc_cmd.rs::filter_tsc_output — group every diagnostic by file, show a
// single compact "Top codes" summary, and emit one line per error. Mirrors RTK's
// formatting (and compression) rather than duplicating a per-code breakdown.
function formatTsc(text: string): string {
  const issues: TscIssue[] = [];
  for (const line of text.split(/\r?\n/)) {
    const issue = parseIssue(line);
    if (issue) {
      issues.push(issue);
      continue;
    }
    if (/^\s{2,}\S/.test(line) && issues.length > 0) issues[issues.length - 1]!.notes.push(line.trim());
  }

  if (issues.length === 0) {
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

  const codeCounts = new Map<string, number>();
  for (const issue of issues) codeCounts.set(issue.code, (codeCounts.get(issue.code) ?? 0) + 1);

  const out: string[] = [
    `TypeScript: ${issues.length} errors in ${byFile.size} files`,
  ];

  // RTK: top error codes on one line, highest count first, capped at 5.
  if (codeCounts.size > 1) {
    const topCodes = [...codeCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([code, count]) => `${code} (${count}x)`);
    out.push(`Top codes: ${topCodes.join(", ")}`, "");
  }

  // RTK: files sorted by error count (most errors first); every error shown, no limit.
  const filesSorted = [...byFile.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );
  for (const [file, fileIssues] of filesSorted) {
    out.push(`${file} (${fileIssues.length} errors)`);
    for (const issue of fileIssues) {
      out.push(`  L${issue.line}: ${issue.code} ${truncate(issue.message, 120)}`);
      for (const note of issue.notes) out.push(`    ${truncate(note, 120)}`);
    }
    out.push("");
  }

  return `${out.join("\n").trimEnd()}\n`;
}

export const tscHandler: CommandHandler = {
  name: "tsc",
  programs: ["tsc"],

  matches: matchesTsc,

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatTsc(`${raw.stdout}\n${raw.stderr}`), options);
  },
};
