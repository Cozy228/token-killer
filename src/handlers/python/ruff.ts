import { executeCommand } from "../../executor.js";
import type { CommandHandler, OmissionDeclaration, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";
import { overBudgetLadder } from "../common/budget.js";

// RTK: python/ruff_cmd.rs — `rtk ruff` forces `check --output-format=json` and
// summarizes the parsed diagnostics (counts + rule codes + file:line locations),
// capping the violation list so a noisy run collapses to a compact report. ctx
// mirrors the command rewrite (buildRuffArgs) and the JSON summary, while keeping
// a text-format fallback for already-rendered ruff output (e.g. fixture stdin).

type RuffIssue = {
  file: string;
  line: string;
  column: string;
  rule: string;
  message: string;
};

function matchesRuff(command: ParsedCommand): boolean {
  return (
    command.program === "ruff" ||
    command.original.includes("ruff") ||
    command.original.join(" ").includes("ruff check")
  );
}

// RTK: ruff_cmd.rs::compact_path — collapse deep paths to a src//lib//tests/ root
// or the bare file name.
function compactPath(rawPath: string): string {
  const p = rawPath.replace(/\\/g, "/");
  for (const root of ["/src/", "/lib/", "/tests/"]) {
    const idx = p.lastIndexOf(root);
    if (idx >= 0) {
      return `${root.slice(1)}${p.slice(idx + root.length)}`;
    }
  }
  const slash = p.lastIndexOf("/");
  return slash >= 0 ? p.slice(slash + 1) : p;
}

function parseTextIssue(line: string): RuffIssue | undefined {
  const match = line.match(/^(.+?):(\d+):(\d+):\s+([A-Z]\d+)\s+(.+)$/);
  if (!match) return undefined;
  return {
    file: match[1] ?? "",
    line: match[2] ?? "",
    column: match[3] ?? "",
    rule: match[4] ?? "",
    message: match[5] ?? "",
  };
}

// RTK: ruff_cmd.rs::RuffDiagnostic — `ruff check --output-format=json` emits an
// array of {code, message, location:{row,column}, filename, fix?}.
type RuffDiagnostic = {
  code?: string;
  message?: string;
  location?: { row?: number; column?: number };
  filename?: string;
  fix?: unknown;
};

function parseJsonDiagnostics(text: string): { issues: RuffIssue[]; fixable: number } | undefined {
  const trimmed = text.trim();
  if (!trimmed.startsWith("[")) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;

  const issues: RuffIssue[] = [];
  let fixable = 0;
  for (const entry of parsed as RuffDiagnostic[]) {
    if (!entry || typeof entry !== "object") return undefined;
    issues.push({
      file: compactPath(entry.filename ?? ""),
      line: String(entry.location?.row ?? ""),
      column: String(entry.location?.column ?? ""),
      rule: entry.code ?? "",
      message: (entry.message ?? "").trim(),
    });
    if (entry.fix != null) fixable += 1;
  }
  return { issues, fixable };
}

function groupByRule(issues: RuffIssue[]): [string, RuffIssue[]][] {
  const byRule = new Map<string, RuffIssue[]>();
  for (const issue of issues) {
    const list = byRule.get(issue.rule) ?? [];
    list.push(issue);
    byRule.set(issue.rule, list);
  }
  return [...byRule.entries()].sort();
}

function header(issues: RuffIssue[], fixableLine: string | undefined): string[] {
  const fileCount = new Set(issues.map((issue) => issue.file)).size;
  const out = [`Ruff: ${issues.length} issues in ${fileCount} files`];
  if (fixableLine) out.push(fixableLine);
  return out;
}

// ADR 0001: ruff diagnostics are location-class — every `file:line:col` is
// evidence the agent opens, and is NEVER capped. Below the token budget the full
// listing (location + message) is emitted; over budget step 1 keeps every
// location but drops the message text (lossless for navigation); if that still
// exceeds budget, step 2 replaces the listing with per-rule counts. No `+N more`.
function renderIssues(
  issues: RuffIssue[],
  fixableLine: string | undefined,
): { output: string; omission?: OmissionDeclaration } {
  const grouped = groupByRule(issues);

  const renderListing = (withMessage: boolean): string => {
    const out = header(issues, fixableLine);
    for (const [rule, ruleIssues] of grouped) {
      const sorted = [...ruleIssues].sort((a, b) => a.file.localeCompare(b.file));
      out.push("", `${rule}: ${ruleIssues.length}`);
      for (const issue of sorted) {
        const loc = `${issue.file}:${issue.line}:${issue.column}`;
        out.push(withMessage ? `- ${loc} ${issue.message}` : `- ${loc}`);
      }
    }
    return `${out.join("\n")}\n`;
  };

  const renderCounts = (): string => {
    const out = header(issues, fixableLine);
    for (const [rule, ruleIssues] of grouped) out.push(`${rule}: ${ruleIssues.length}`);
    return `${out.join("\n")}\n`;
  };

  const ladder = overBudgetLadder({
    full: renderListing(true),
    digest: () => renderListing(false),
    replacement: renderCounts,
  });
  return { output: ladder.text, omission: ladder.omission };
}

function formatRuff(
  stdout: string,
  stderr: string,
  command: ParsedCommand,
): { output: string; omission?: OmissionDeclaration } {
  // RTK: ruff_cmd.rs::filter_ruff_check_json — parse the forced JSON output first.
  // JSON lands on stdout; ruff diagnostics never mix into the JSON array, so parse
  // stdout alone (stderr may carry unrelated warnings that would break JSON.parse).
  const json = parseJsonDiagnostics(stdout);
  if (json) {
    if (json.issues.length === 0) return { output: "Ruff: 0 issues in 0 files\n" };
    const fixableLine =
      json.fixable > 0 ? `[*] ${json.fixable} fixable with the \`--fix\` option.` : undefined;
    return renderIssues(json.issues, fixableLine);
  }

  // Fallback: already-rendered text output (e.g. fixture stdin without JSON).
  const text = `${stdout}\n${stderr}`;
  const issues = text
    .split(/\r?\n/)
    .map(parseTextIssue)
    .filter((issue): issue is RuffIssue => Boolean(issue));
  if (issues.length === 0 && text.trim()) {
    if (command.args[0] === "format") return { output: `${text.trimEnd()}\n` };
    if (/All checks passed/i.test(text)) return { output: "Ruff: 0 issues in 0 files\n" };
    return { output: `${text.trimEnd()}\n` };
  }
  const fixableLine = text.split(/\r?\n/).find((line) => line.includes("fixable"));
  return renderIssues(issues, fixableLine?.trim());
}

// Known ruff subcommands that are NOT check-mode runs — they must pass through
// unchanged. Any first token matching one of these is a non-check subcommand.
const RUFF_NON_CHECK_SUBCOMMANDS = new Set([
  "format",
  "version",
  "rule",
  "linter",
  "config",
  "clean",
  "server",
  "analyze",
]);

// Flags that are incompatible with forced JSON output — if any are present in
// a check invocation we pass through so the user's intended output is preserved.
const RUFF_PASSTHROUGH_FLAGS = new Set(["--statistics", "--diff", "--watch", "-W"]);

// RTK: ruff_cmd.rs::run — force `check --output-format=json` for check-mode
// invocations (unless the user already set an output format). `format`/`version`
// and all other non-check subcommands pass through unchanged. Invocations that
// contain --statistics/--diff/--watch also pass through (output shape is
// incompatible with JSON). When only flags remain, default the target to `.`
// like RTK.
export function buildRuffArgs(userArgs: string[]): string[] {
  const first = userArgs[0];

  // H11-ruff fix: only rewrite when the invocation is a check run — either
  // explicit `check`, a bare invocation (no subcommand), or a path argument
  // (starts with `.` or `/` or does NOT start with `-` but also is not one of
  // the known non-check subcommands). Everything else passes through.
  const isCheckSubcommand = first === "check";
  const isBareOrPath =
    userArgs.length === 0 ||
    (!!first && !first.startsWith("-") && !RUFF_NON_CHECK_SUBCOMMANDS.has(first));
  const isCheck = isCheckSubcommand || isBareOrPath;

  if (!isCheck) return userArgs;

  // Pass through if incompatible flags are present.
  if (userArgs.some((a) => RUFF_PASSTHROUGH_FLAGS.has(a))) return userArgs;

  const hasFormat = userArgs.some(
    (a) => a === "--output-format" || a.startsWith("--output-format="),
  );
  const rest = isCheckSubcommand ? userArgs.slice(1) : userArgs;
  const out = ["check"];
  if (!hasFormat) out.push("--output-format=json");
  out.push(...rest);
  if (rest.length > 0 && rest.every((a) => a.startsWith("-") || a.includes("="))) {
    out.push(".");
  } else if (rest.length === 0) {
    out.push(".");
  }
  return out;
}

export const ruffHandler: CommandHandler = {
  name: "ruff",
  traits: { ladder: true, cacheable: true, ttlClass: "medium" },
  programs: ["ruff"],

  matches: matchesRuff,

  execute(command) {
    // RTK: ruff_cmd.rs::run — only rewrite the bare `ruff` program (wrapped forms
    // like `pnpm exec ruff` are left untouched).
    if (command.program !== "ruff") return executeCommand(command);
    const args = buildRuffArgs(command.args);
    const rewritten: ParsedCommand = {
      ...command,
      args,
      original: ["ruff", ...args],
      displayCommand: `ruff ${args.join(" ")}`.trim(),
    };
    return executeCommand(rewritten);
  },

  async filter(raw, command, options) {
    const { output, omission } = formatRuff(raw.stdout, raw.stderr, command);
    return makeFilteredResult(this, raw, output, options, undefined, omission);
  },
};
