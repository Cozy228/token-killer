import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TkOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";
import { type LadderResult, overBudgetLadder } from "../common/budget.js";

function text(raw: RawResult): string {
  return `${raw.stdout}${raw.stderr}`.trimEnd();
}

function stripMarkdownNoise(body: string): string {
  return body
    .split(/\r?\n/)
    .filter((line) => !/<!--|badge\.svg|!\[|^---$/.test(line))
    .join("\n")
    .trim();
}

function parseJson(rawText: string): any | undefined {
  try {
    return JSON.parse(rawText);
  } catch {
    return undefined;
  }
}

function hasRawJsonFlag(command: ParsedCommand): boolean {
  return (
    command.args.includes("--json") ||
    command.args.includes("--output") ||
    command.args.includes("-F")
  );
}

// RTK: gh_cmd.rs — RTK never trusts gh's human table output; it re-runs the
// command with `--json <fields>` (per subcommand) and filters the JSON. When the
// user already passes `--json` they want raw gh JSON, so RTK passes through.
const GH_VIEW_PASSTHROUGH = ["--jq", "--web", "--comments"];

export function buildGhArgs(args: string[]): string[] {
  if (args.includes("--json")) return args; // RTK: gh_cmd.rs::has_json_flag
  const [resource, action, ...rest] = args;

  if (resource === "pr" && action === "list") {
    return ["pr", "list", "--json", "number,title,state,author,updatedAt", ...rest];
  }
  if (resource === "pr" && action === "view") {
    if (rest.some((a) => GH_VIEW_PASSTHROUGH.includes(a))) return args;
    // RTK extracts the id and appends extra args after --json; gh accepts the id
    // and flags in any order, so passing `rest` ahead of --json is equivalent.
    return [
      "pr",
      "view",
      ...rest,
      "--json",
      "number,title,state,author,body,url,mergeable,reviews,statusCheckRollup",
    ];
  }
  if (resource === "issue" && action === "list") {
    return ["issue", "list", "--json", "number,title,state,author", ...rest];
  }
  if (resource === "issue" && action === "view") {
    if (rest.some((a) => GH_VIEW_PASSTHROUGH.includes(a))) return args;
    return ["issue", "view", ...rest, "--json", "number,title,state,author,body,url"];
  }
  if (resource === "run" && action === "list") {
    return [
      "run",
      "list",
      "--json",
      "databaseId,name,status,conclusion,createdAt",
      "--limit",
      "10",
      ...rest,
    ];
  }
  if (resource === "repo" && action === "view") {
    return [
      "repo",
      "view",
      ...rest,
      "--json",
      "name,owner,description,url,stargazerCount,forkCount,isPrivate",
    ];
  }
  return args;
}

// RTK: glab_cmd.rs — list/view inject `-F json`; an explicit `--output`/`-F`/
// `--json` (or a browser/comment view flag) means passthrough.
const GLAB_OUTPUT_FLAGS = ["--output", "-F", "--json"];
const GLAB_VIEW_PASSTHROUGH = ["--web", "--comments", "--output", "-F"];

export function buildGlabArgs(args: string[]): string[] {
  if (args.some((a) => GLAB_OUTPUT_FLAGS.includes(a))) return args;
  const [resource, action, ...rest] = args;

  if (resource === "mr" && action === "list") {
    return ["mr", "list", "-F", "json", ...rest];
  }
  if (resource === "mr" && action === "view") {
    if (rest.some((a) => GLAB_VIEW_PASSTHROUGH.includes(a))) return args;
    return ["mr", "view", ...rest, "-F", "json"];
  }
  return args;
}

// RTK: core/utils.rs::truncate — char-based, "(max-3 chars)..." when over max.
function truncate(s: string, max: number): string {
  const chars = [...s];
  if (chars.length <= max) return s;
  if (max < 3) return "...";
  return `${chars.slice(0, max - 3).join("")}...`;
}

// RTK: gh_cmd.rs / glab_cmd.rs::state_icon (non-ultra-compact text tags).
function ghStateIcon(state: string): string {
  switch (state) {
    case "OPEN":
      return "[open]";
    case "MERGED":
      return "[merged]";
    case "CLOSED":
      return "[closed]";
    default:
      return "[unknown]";
  }
}

function glabStateIcon(state: string): string {
  switch (state) {
    case "opened":
      return "[open]";
    case "merged":
      return "[merged]";
    case "closed":
      return "[closed]";
    default:
      return "?";
  }
}

// RTK: gh_cmd.rs::format_pr_list / glab_cmd.rs::format_mr_list — a "Header\n" line
// then "  <icon> <num> <title> (<author>)" rows. ADR 0001 decisions 2/5/7: RTK's
// CAP_LIST (20) + "  … +N more" cap is REMOVED. Within budget every row ships; over
// budget the step-1 lossless digest keeps every item (`#num title`, dropping the
// state-icon/author decoration) and, if still over, a count replacement. No marker.
function formatList(
  header: string,
  emptyLabel: string,
  rows: string[],
  digestRows: string[],
): LadderResult {
  if (rows.length === 0) return { text: `${emptyLabel}\n` };
  return overBudgetLadder({
    full: `${[header, ...rows].join("\n")}\n`,
    digest: () => `${[header, ...digestRows].join("\n")}\n`,
    replacement: () => `${header}: ${rows.length}\n`,
  });
}

function formatGh(raw: RawResult, command: ParsedCommand): LadderResult {
  const rawText = text(raw);
  if (hasRawJsonFlag(command)) return { text: `${rawText}\n` };
  const json = parseJson(rawText);
  const [resource, action] = command.args;

  if (resource === "pr" && action === "list" && Array.isArray(json)) {
    // RTK: gh_cmd.rs::format_pr_list — "Pull Requests\n  [open] #N title (author)".
    const rows = json.map(
      (pr) =>
        `  ${ghStateIcon(pr.state ?? "???")} #${pr.number ?? 0} ${truncate(pr.title ?? "???", 60)} (${pr.author?.login ?? "???"})`,
    );
    // Step-1 digest: keep every PR's number + title, drop the state icon + author.
    const digestRows = json.map((pr) => `  #${pr.number ?? 0} ${truncate(pr.title ?? "???", 60)}`);
    return formatList("Pull Requests", "No Pull Requests", rows, digestRows);
  }
  if (resource === "pr" && action === "view" && json) {
    return {
      text: `#${json.number} ${json.title}\n${json.state} @${json.author?.login ?? "unknown"} ${json.mergeable ?? ""}\n${(json.labels ?? []).map((label: any) => label.name).join(", ")}\n${json.url ?? ""}\n${stripMarkdownNoise(json.body ?? "")}\n`,
    };
  }
  if (resource === "pr" && action === "checks") {
    return {
      text: `${rawText
        .split(/\r?\n/)
        .filter((line) => /\bfail\b|failed/i.test(line))
        .join("\n")}\n`,
    };
  }
  if (resource === "issue" && action === "list" && Array.isArray(json)) {
    // RTK: gh_cmd.rs::format_issue_list — "Issues\n  [open] #N title" (no labels;
    // RTK only fetches number,title,state,author).
    const rows = json.map(
      (issue) =>
        `  ${(issue.state ?? "???") === "OPEN" ? "[open]" : "[closed]"} #${issue.number ?? 0} ${truncate(issue.title ?? "???", 60)}`,
    );
    // Step-1 digest: keep every issue's number + title, drop the state icon.
    const digestRows = json.map(
      (issue) => `  #${issue.number ?? 0} ${truncate(issue.title ?? "???", 60)}`,
    );
    return formatList("Issues", "No Issues", rows, digestRows);
  }
  if (resource === "issue" && action === "view" && json) {
    // RTK: gh_cmd.rs::format_issue_view.
    const icon = (json.state ?? "???") === "OPEN" ? "[open]" : "[closed]";
    const out = [
      `${icon} Issue #${json.number ?? 0}: ${json.title ?? "???"}`,
      `  Author: @${json.author?.login ?? "???"}`,
      `  Status: ${json.state ?? "???"}`,
      `  URL: ${json.url ?? ""}`,
    ];
    const body = typeof json.body === "string" ? json.body : "";
    if (body !== "") {
      const filtered = stripMarkdownNoise(body);
      if (filtered !== "") {
        out.push("", "  Description:");
        for (const line of filtered.split(/\r?\n/)) out.push(`    ${line}`);
      } else {
        out.push("", "  Description: (body contained only badges/images/comments)");
      }
    }
    return { text: `${out.join("\n")}\n` };
  }
  if (resource === "run" && action === "list" && Array.isArray(json)) {
    // RTK: gh_cmd.rs::format_run_list — "Workflow Runs\n  <icon> <name> [<id>]".
    const rows = json.map((run) => {
      const status = run.status ?? "???";
      const conclusion = run.conclusion ?? "";
      const icon =
        conclusion === "success"
          ? "[ok]"
          : conclusion === "failure"
            ? "[FAIL]"
            : conclusion === "cancelled"
              ? "[X]"
              : status === "in_progress"
                ? "[time]"
                : "[pending]";
      return `  ${icon} ${truncate(run.name ?? "???", 50)} [${run.databaseId ?? 0}]`;
    });
    // RTK injects `--limit 10`, so the run list is already bounded — ship in full.
    return { text: `Workflow Runs\n${rows.join("\n")}\n` };
  }
  if (resource === "repo" && action === "view" && json) {
    // RTK: gh_cmd.rs::format_repo_view.
    const owner = json.owner?.login ?? "???";
    const name = json.name ?? "???";
    const description = json.description ?? "";
    const visibility = json.isPrivate ? "[private]" : "[public]";
    const out = [`${owner}/${name}`, `  ${visibility}`];
    if (description !== "") out.push(`  ${truncate(description, 80)}`);
    out.push(`  ${json.stargazerCount ?? 0} stars | ${json.forkCount ?? 0} forks`);
    out.push(`  ${json.url ?? ""}`);
    return { text: `${out.join("\n")}\n` };
  }
  return { text: `${rawText}\n` };
}

function formatGlab(raw: RawResult, command: ParsedCommand): LadderResult {
  const rawText = text(raw);
  if (hasRawJsonFlag(command)) return { text: `${rawText}\n` };
  const json = parseJson(rawText);
  const [resource, action] = command.args;

  if (resource === "mr" && action === "list" && Array.isArray(json)) {
    // RTK: glab_cmd.rs::format_mr_list — "Merge Requests\n  [open] !iid title (author)".
    const rows = json.map(
      (mr) =>
        `  ${glabStateIcon(mr.state ?? "???")} !${mr.iid ?? 0} ${truncate(mr.title ?? "???", 60)} (${mr.author?.username ?? "???"})`,
    );
    // Step-1 digest: keep every MR's iid + title, drop the state icon + author.
    const digestRows = json.map((mr) => `  !${mr.iid ?? 0} ${truncate(mr.title ?? "???", 60)}`);
    return formatList("Merge Requests", "No Merge Requests", rows, digestRows);
  }
  if (resource === "mr" && action === "view" && json) {
    return {
      text: `!${json.iid} ${json.title}\n${json.state} ${json.source_branch} -> ${json.target_branch}\n${(json.labels ?? []).join(", ")}\n${(json.reviewers ?? []).map((reviewer: any) => reviewer.username).join(", ")}\n${json.merge_status ?? ""}\n${json.description ?? ""}\n${json.web_url ?? ""}\n`,
    };
  }
  if (resource === "ci" && action === "list" && Array.isArray(json)) {
    return {
      text: `${json.map((pipeline) => `${pipeline.id} ${pipeline.status} ${pipeline.ref} ${pipeline.web_url ?? ""}`).join("\n")}\n`,
    };
  }
  if (resource === "ci" && action === "trace") {
    return {
      text: `${rawText
        .split(/\r?\n/)
        .filter((line) => !/section_start|section_end|gitlab-runner|Fetching changes/.test(line))
        .join("\n")}\n`,
    };
  }
  if (resource === "release" && action === "list") {
    return { text: `${rawText.split(/\r?\n/).slice(0, 1).join("\n")}\n` };
  }
  return { text: `${rawText}\n` };
}

function makeHostingHandler(
  program: "gh" | "glab",
  buildArgs: (args: string[]) => string[],
  formatter: (raw: RawResult, command: ParsedCommand) => LadderResult,
): CommandHandler {
  return {
    name: program,
    programs: [program],
    matches(command) {
      return command.program === program;
    },
    execute(command) {
      // RTK re-runs the command with an injected JSON output flag so the filter
      // works on structured data instead of gh/glab's human table.
      const args = buildArgs(command.args);
      if (args === command.args) return executeCommand(command);
      return executeCommand({
        ...command,
        args,
        displayCommand: `${program} ${args.join(" ")}`,
      });
    },
    async filter(raw, command, options: TkOptions) {
      const { text: output, omission } = formatter(raw, command);
      return makeFilteredResult(this.name, raw, output, options, undefined, omission);
    },
  };
}

export const ghHandler = makeHostingHandler("gh", buildGhArgs, formatGh);
export const glabHandler = makeHostingHandler("glab", buildGlabArgs, formatGlab);
