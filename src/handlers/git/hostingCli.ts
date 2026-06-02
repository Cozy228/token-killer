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

function formatGh(raw: RawResult, command: ParsedCommand): string {
  const rawText = text(raw);
  if (hasRawJsonFlag(command)) return `${rawText}\n`;
  const json = parseJson(rawText);
  const [resource, action] = command.args;

  if (resource === "pr" && action === "list" && Array.isArray(json)) {
    return `${json.map((pr) => `#${pr.number} ${pr.title} @${pr.author?.login ?? "unknown"} ${pr.state}${pr.headRefName ? ` ${pr.headRefName}` : ""}`).join("\n")}\n`;
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
    return `${json.nameWithOwner}\n${json.description ?? ""}\ndefault: ${json.defaultBranchRef?.name ?? ""}\n${json.isPrivate ? "private" : "public"}\n${json.url ?? ""}\n`;
  }
  return `${rawText}\n`;
}

function formatGlab(raw: RawResult, command: ParsedCommand): string {
  const rawText = text(raw);
  if (hasRawJsonFlag(command)) return `${rawText}\n`;
  const json = parseJson(rawText);
  const [resource, action] = command.args;

  if (resource === "mr" && action === "list" && Array.isArray(json)) {
    return `${json.map((mr) => `!${mr.iid} ${mr.title} @${mr.author?.username ?? "unknown"} ${mr.state}${mr.source_branch ? ` ${mr.source_branch}` : ""}`).join("\n")}\n`;
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
