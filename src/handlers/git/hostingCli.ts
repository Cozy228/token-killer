import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

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
  return command.args.includes("--json") || command.args.includes("--output") || command.args.includes("-F");
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

// RTK: core/truncate.rs CAP_LIST.
const CAP_LIST = 20;

// RTK: gh_cmd.rs::format_pr_list / glab_cmd.rs::format_mr_list — a "Header\n" line
// then "  <icon> <num> <title> (<author>)" rows, capped at CAP_LIST with "  … +N more".
function formatList(
  header: string,
  emptyLabel: string,
  rows: string[],
): string {
  if (rows.length === 0) return `${emptyLabel}\n`;
  const out: string[] = [header];
  for (const line of rows.slice(0, CAP_LIST)) out.push(line);
  if (rows.length > CAP_LIST) out.push(`  … +${rows.length - CAP_LIST} more`);
  return `${out.join("\n")}\n`;
}

function formatGh(raw: RawResult, command: ParsedCommand): string {
  const rawText = text(raw);
  if (hasRawJsonFlag(command)) return `${rawText}\n`;
  const json = parseJson(rawText);
  const [resource, action] = command.args;

  if (resource === "pr" && action === "list" && Array.isArray(json)) {
    // RTK: gh_cmd.rs::format_pr_list — "Pull Requests\n  [open] #N title (author)".
    const rows = json.map(
      (pr) =>
        `  ${ghStateIcon(pr.state ?? "???")} #${pr.number ?? 0} ${truncate(pr.title ?? "???", 60)} (${pr.author?.login ?? "???"})`,
    );
    return formatList("Pull Requests", "No Pull Requests", rows);
  }
  if (resource === "pr" && action === "view" && json) {
    return `#${json.number} ${json.title}\n${json.state} @${json.author?.login ?? "unknown"} ${json.mergeable ?? ""}\n${(json.labels ?? []).map((label: any) => label.name).join(", ")}\n${json.url ?? ""}\n${stripMarkdownNoise(json.body ?? "")}\n`;
  }
  if (resource === "pr" && action === "checks") {
    return `${rawText
      .split(/\r?\n/)
      .filter((line) => /\bfail\b|failed/i.test(line))
      .join("\n")}\n`;
  }
  if (resource === "issue" && action === "list" && Array.isArray(json)) {
    return `${json.map((issue) => `#${issue.number} ${issue.title} ${(issue.labels ?? []).map((label: any) => label.name).join(",")}`).join("\n")}\n`;
  }
  if (resource === "run" && action === "list" && Array.isArray(json)) {
    return `${json.map((run) => `${run.databaseId} ${run.workflowName} ${run.status}/${run.conclusion} ${run.headBranch} ${run.displayTitle}`).join("\n")}\n`;
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
    return `${out.join("\n")}\n`;
  }
  return `${rawText}\n`;
}

function formatGlab(raw: RawResult, command: ParsedCommand): string {
  const rawText = text(raw);
  if (hasRawJsonFlag(command)) return `${rawText}\n`;
  const json = parseJson(rawText);
  const [resource, action] = command.args;

  if (resource === "mr" && action === "list" && Array.isArray(json)) {
    // RTK: glab_cmd.rs::format_mr_list — "Merge Requests\n  [open] !iid title (author)".
    const rows = json.map(
      (mr) =>
        `  ${glabStateIcon(mr.state ?? "???")} !${mr.iid ?? 0} ${truncate(mr.title ?? "???", 60)} (${mr.author?.username ?? "???"})`,
    );
    return formatList("Merge Requests", "No Merge Requests", rows);
  }
  if (resource === "mr" && action === "view" && json) {
    return `!${json.iid} ${json.title}\n${json.state} ${json.source_branch} -> ${json.target_branch}\n${(json.labels ?? []).join(", ")}\n${(json.reviewers ?? []).map((reviewer: any) => reviewer.username).join(", ")}\n${json.merge_status ?? ""}\n${json.description ?? ""}\n${json.web_url ?? ""}\n`;
  }
  if (resource === "ci" && action === "list" && Array.isArray(json)) {
    return `${json.map((pipeline) => `${pipeline.id} ${pipeline.status} ${pipeline.ref} ${pipeline.web_url ?? ""}`).join("\n")}\n`;
  }
  if (resource === "ci" && action === "trace") {
    return `${rawText
      .split(/\r?\n/)
      .filter((line) => !/section_start|section_end|gitlab-runner|Fetching changes/.test(line))
      .join("\n")}\n`;
  }
  if (resource === "release" && action === "list") {
    return `${rawText.split(/\r?\n/).slice(0, 1).join("\n")}\n`;
  }
  return `${rawText}\n`;
}

function makeHostingHandler(program: "gh" | "glab", formatter: (raw: RawResult, command: ParsedCommand) => string): CommandHandler {
  return {
    name: program,
    matches(command) {
      return command.program === program;
    },
    execute(command) {
      return executeCommand(command);
    },
    async filter(raw, command, options: TgOptions) {
      return makeFilteredResult(this.name, raw, formatter(raw, command), options);
    },
  };
}

export const ghHandler = makeHostingHandler("gh", formatGh);
export const glabHandler = makeHostingHandler("glab", formatGlab);
