import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TkOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

// RTK: git/gt_cmd.rs — Graphite (gt) stacking CLI output filters.
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const BRANCH_NAME_RE = /(?:Created|Pushed|pushed|Deleted|deleted)\s+branch\s+[`"']?([a-zA-Z0-9/_.\-+@]+)/;
const PR_LINE_RE = /(Created|Updated)\s+pull\s+request\s+#(\d+)\s+for\s+([^\s:]+)(?::\s*(\S+))?/;

// RTK: core/truncate.rs CAP_LIST=20, reduced(CAP_LIST, 5)=15.
const MAX_LOG_ENTRIES = 15;

// RTK: core/utils.rs::truncate — keep up to max chars, else (max-3) chars + "...".
function truncate(s: string, max: number): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  if (max < 3) return "...";
  return `${chars.slice(0, max - 3).join("")}...`;
}

// RTK: core/utils.rs::ok_confirmation.
function okConfirmation(action: string, detail: string): string {
  return detail === "" ? `ok ${action}` : `ok ${action} ${detail}`;
}

// RTK: gt_cmd.rs::is_graph_node.
function isGraphNode(line: string): boolean {
  const stripped = line.replace(/^[│|]+/, "").trimStart();
  return /^[◉○◯◆●@*]/.test(stripped);
}

// RTK: gt_cmd.rs::extract_branch_name.
function extractBranchName(line: string): string {
  return line.match(BRANCH_NAME_RE)?.[1] ?? "";
}

// RTK: gt_cmd.rs::filter_gt_log_entries — keep the graph, strip emails, truncate
// lines to 120 chars, cap entries at MAX_LOG_ENTRIES with "... +N more entries".
function filterGtLog(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";
  const lines = trimmed.split("\n");
  const result: string[] = [];
  let entryCount = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (isGraphNode(line)) entryCount += 1;
    // Bound the input BEFORE the email regex (audit #19): EMAIL_RE has overlapping
    // character classes that backtrack catastrophically on a long line (a measured
    // 80KB line took ~13s over untrusted `gt` output). A real branch-graph row is
    // short; 2000 chars is far beyond any of them yet keeps the match bounded, and
    // covers any genuine email before the final 120-char display truncation.
    const bounded = line.length > 2000 ? line.slice(0, 2000) : line;
    const replaced = bounded.replace(EMAIL_RE, "");
    result.push(truncate(replaced.replace(/\s+$/, ""), 120));
    if (entryCount >= MAX_LOG_ENTRIES) {
      const remaining = lines.slice(i + 1).filter((l) => isGraphNode(l)).length;
      if (remaining > 0) result.push(`... +${remaining} more entries`);
      break;
    }
  }
  return result.join("\n");
}

// RTK: gt_cmd.rs::filter_gt_submit.
function filterGtSubmit(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";
  const pushed: string[] = [];
  const prs: string[] = [];
  for (const rawLine of trimmed.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (line.includes("pushed") || line.includes("Pushed")) {
      pushed.push(extractBranchName(line));
    } else {
      const caps = line.match(PR_LINE_RE);
      if (caps) {
        const action = caps[1]!.toLowerCase();
        const num = caps[2];
        const branch = caps[3];
        prs.push(caps[4] ? `${action} PR #${num} ${branch} ${caps[4]}` : `${action} PR #${num} ${branch}`);
      }
    }
  }
  const summary: string[] = [];
  if (pushed.length > 0) {
    const names = pushed.filter((s) => s !== "");
    summary.push(names.length > 0 ? `pushed ${names.join(", ")}` : `pushed ${pushed.length} branches`);
  }
  summary.push(...prs);
  if (summary.length === 0) return truncate(trimmed, 200);
  return summary.join("\n");
}

// RTK: gt_cmd.rs::filter_gt_sync.
function filterGtSync(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";
  let synced = 0;
  let deleted = 0;
  const deletedNames: string[] = [];
  for (const rawLine of trimmed.split("\n")) {
    const line = rawLine.trim();
    if (line === "") continue;
    if ((line.includes("Synced") && line.includes("branch")) || line.startsWith("Synced with remote")) {
      synced += 1;
    }
    if (line.includes("deleted") || line.includes("Deleted")) {
      deleted += 1;
      const name = extractBranchName(line);
      if (name !== "") deletedNames.push(name);
    }
  }
  const parts: string[] = [];
  if (synced > 0) parts.push(`${synced} synced`);
  if (deleted > 0) {
    parts.push(deletedNames.length === 0 ? `${deleted} deleted` : `${deleted} deleted (${deletedNames.join(", ")})`);
  }
  if (parts.length === 0) return okConfirmation("synced", "");
  return `ok sync: ${parts.join(", ")}`;
}

// RTK: gt_cmd.rs::filter_gt_restack.
function filterGtRestack(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";
  let restacked = 0;
  for (const rawLine of trimmed.split("\n")) {
    const line = rawLine.trim();
    if ((line.includes("Restacked") || line.includes("Rebased")) && line.includes("branch")) {
      restacked += 1;
    }
  }
  return restacked > 0 ? okConfirmation("restacked", `${restacked} branches`) : okConfirmation("restacked", "");
}

// RTK: gt_cmd.rs::filter_gt_create.
function filterGtCreate(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";
  let branchName = "";
  for (const rawLine of trimmed.split("\n")) {
    const line = rawLine.trim();
    if (line.includes("Created") || line.includes("created")) {
      branchName = extractBranchName(line);
      break;
    }
  }
  if (branchName === "") {
    const firstLine = trimmed.split("\n")[0]?.trim() ?? "";
    return okConfirmation("created", firstLine);
  }
  return okConfirmation("created", branchName);
}

const GT_FILTERS: Record<string, (input: string) => string> = {
  log: filterGtLog,
  ll: filterGtLog,
  submit: filterGtSubmit,
  ss: filterGtSubmit,
  sync: filterGtSync,
  restack: filterGtRestack,
  create: filterGtCreate,
};

function formatGt(raw: RawResult, command: ParsedCommand): string {
  const subcommand = command.args[0] ?? "";
  const filter = GT_FILTERS[subcommand];
  const stdout = raw.stdout.trim();
  if (!filter) return `${`${raw.stdout}${raw.stderr}`.trimEnd()}\n`;
  return `${filter(stdout)}\n`;
}

export const gtHandler: CommandHandler = {
  name: "gt",
  programs: ["gt"],
  matches(command) {
    return command.program === "gt";
  },
  execute(command) {
    return executeCommand(command);
  },
  async filter(raw, command, options: TkOptions) {
    return makeFilteredResult(this.name, raw, formatGt(raw, command), options);
  },
};
