import type { ParsedCommand, RawResult } from "../../types.js";
import { defineHandler } from "../define.js";
import { type LadderResult, overBudgetLadder } from "../common/budget.js";

// RTK: git/gt_cmd.rs — Graphite (gt) stacking CLI output filters.
const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const BRANCH_NAME_RE =
  /(?:Created|Pushed|pushed|Deleted|deleted)\s+branch\s+[`"']?([a-zA-Z0-9/_.\-+@]+)/;
const PR_LINE_RE = /(Created|Updated)\s+pull\s+request\s+#(\d+)\s+for\s+([^\s:]+)(?::\s*(\S+))?/;

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
// lines to 120 chars. ADR 0001 decisions 2/5/7: RTK's MAX_LOG_ENTRIES (15) cap +
// "... +N more entries" marker is REMOVED. Within budget the whole graph ships;
// over budget the step-1 lossless digest keeps every graph-node row (the branch /
// commit identity), dropping the pure connector art, then a count replacement. No
// "... +N more".
function cleanGtLine(line: string): string {
  // Bound the input BEFORE the email regex (audit #19): EMAIL_RE has overlapping
  // character classes that backtrack catastrophically on a long line (a measured
  // 80KB line took ~13s over untrusted `gt` output). A real branch-graph row is
  // short; 2000 chars is far beyond any of them yet keeps the match bounded, and
  // covers any genuine email before the final 120-char display truncation.
  const bounded = line.length > 2000 ? line.slice(0, 2000) : line;
  return truncate(bounded.replace(EMAIL_RE, "").replace(/\s+$/, ""), 120);
}

function filterGtLog(input: string): LadderResult {
  const trimmed = input.trim();
  if (trimmed === "") return { text: "" };
  const lines = trimmed.split("\n");
  const fullLines = lines.map(cleanGtLine);
  const nodeLines = lines.filter((l) => isGraphNode(l)).map(cleanGtLine);
  return overBudgetLadder({
    full: fullLines.join("\n"),
    digest: () => nodeLines.join("\n"),
    replacement: () => `${nodeLines.length} entries`,
  });
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
        prs.push(
          caps[4] ? `${action} PR #${num} ${branch} ${caps[4]}` : `${action} PR #${num} ${branch}`,
        );
      }
    }
  }
  const summary: string[] = [];
  if (pushed.length > 0) {
    const names = pushed.filter((s) => s !== "");
    summary.push(
      names.length > 0 ? `pushed ${names.join(", ")}` : `pushed ${pushed.length} branches`,
    );
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
    if (
      (line.includes("Synced") && line.includes("branch")) ||
      line.startsWith("Synced with remote")
    ) {
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
    parts.push(
      deletedNames.length === 0
        ? `${deleted} deleted`
        : `${deleted} deleted (${deletedNames.join(", ")})`,
    );
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
  return restacked > 0
    ? okConfirmation("restacked", `${restacked} branches`)
    : okConfirmation("restacked", "");
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

// `log`/`ll` run the over-budget ladder (LadderResult); the summary filters are
// already aggregates with no list cap, so they wrap their string in a text-only
// LadderResult (no omission).
const GT_FILTERS: Record<string, (input: string) => LadderResult> = {
  log: filterGtLog,
  ll: filterGtLog,
  submit: (input) => ({ text: filterGtSubmit(input) }),
  ss: (input) => ({ text: filterGtSubmit(input) }),
  sync: (input) => ({ text: filterGtSync(input) }),
  restack: (input) => ({ text: filterGtRestack(input) }),
  create: (input) => ({ text: filterGtCreate(input) }),
};

function formatGt(raw: RawResult, command: ParsedCommand): LadderResult {
  const subcommand = command.args[0] ?? "";
  const filter = GT_FILTERS[subcommand];
  const stdout = raw.stdout.trim();
  if (!filter) return { text: `${`${raw.stdout}${raw.stderr}`.trimEnd()}\n` };
  const { text: body, omission } = filter(stdout);
  return { text: `${body}\n`, omission };
}

export const gtHandler = defineHandler({
  name: "gt",
  programs: ["gt"],
  match(command) {
    return command.program === "gt";
  },
  format(raw, command, _options) {
    const { text, omission } = formatGt(raw, command);
    return { output: text, omission };
  },
});
