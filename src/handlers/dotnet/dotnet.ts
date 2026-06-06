import { executeCommand } from "../../executor.js";
import type { CommandHandler, OmissionDeclaration, ParsedCommand } from "../../types.js";
import { makeFilteredResult, rawText } from "../base.js";
import { overBudgetLadder } from "../common/budget.js";

// RTK: cmds/dotnet/{dotnet_cmd,dotnet_trx,binlog,dotnet_format_report}.rs — the
// `dotnet` proxy keeps test failures + summaries (stripping restore/build
// boilerplate), parses TRX XML for failed test names/messages, extracts build
// errors from binlog text while redacting sensitive env values, and summarizes
// `dotnet format` report JSON. tk routes the four behaviors from one handler.

// RTK: core/utils.rs::truncate.
function truncate(text: string, maxLen: number): string {
  const chars = [...text];
  if (chars.length <= maxLen) return text;
  if (maxLen < 3) return "...";
  return `${chars.slice(0, maxLen - 3).join("")}...`;
}

// --- dotnet test (console text) ---------------------------------------------

type DotnetFailure = { name: string; messages: string[] };

// RTK: dotnet_cmd.rs / binlog.rs::parse_test_from_text — keep failed test names,
// their error messages, and the final counts line; drop restore/build chatter.
function formatDotnetTest(text: string): { output: string; omission?: OmissionDeclaration } {
  const failures: DotnetFailure[] = [];
  const summary: string[] = [];

  for (const line of text.split("\n")) {
    const failed = line.match(/^\s*Failed\s+(\S+)/);
    if (failed) {
      failures.push({ name: failed[1] ?? "", messages: [] });
      continue;
    }
    const message = line.match(/^\s*(?:Error Message|Message):\s*(.*)$/);
    if (message) {
      const messageText = (message[1] ?? "").trim();
      if (failures.length > 0) failures[failures.length - 1]!.messages.push(messageText);
      continue;
    }
    if (
      line.includes("Total tests:") ||
      (/Passed:\s*\d+/.test(line) && /Failed:\s*\d+/.test(line)) ||
      /Failed!\s+-\s+Failed:/.test(line)
    ) {
      summary.push(line.trim());
    }
  }

  // ADR 0001 (audit #2): a failing test's error message is evidence and is NEVER
  // silently clipped (the old `truncate(message, 120)` dropped stack-trace tails
  // with no marker/snapshot). full keeps every message line; over budget step 1
  // keeps every failure NAME (drops messages); step 2 is a count.
  const render = (withMessages: boolean): string => {
    const out: string[] = [];
    if (failures.length > 0) {
      out.push("Failed Tests:");
      for (const failure of failures) {
        out.push(`  ${failure.name}`);
        if (withMessages) {
          for (const message of failure.messages) out.push(`    ${message}`);
        }
      }
    }
    for (const line of summary) out.push(line);
    return out.length > 0 ? `${out.join("\n")}\n` : text;
  };

  if (failures.length === 0) return { output: render(false) };

  const ladder = overBudgetLadder({
    full: render(true),
    digest: () => render(false),
    replacement: () => `${["Failed Tests: " + failures.length + " (over budget)", ...summary].join("\n")}\n`,
  });
  return { output: ladder.text, omission: ladder.omission };
}

// --- dotnet test --logger trx (TRX XML) -------------------------------------

// RTK: dotnet_trx.rs::parse_trx_content — read Counters + failed UnitTestResults.
// Each failing test's message is extracted from WITHIN its own <UnitTestResult>
// block (its <Output>/<ErrorInfo>/<Message>), not from a global list of every
// <Message> in the file zipped by index. The old index-zip mis-attributed a
// passing test's stdout (or the <ResultSummary>) as a failing test's error —
// fabricating a wrong reason, a retention corruption worse than a drop (audit #7).
function formatDotnetTrx(text: string): { output: string; omission?: OmissionDeclaration } {
  const failedCounter = text.match(/<Counters\b[^>]*\bfailed="(\d+)"/);
  const failedCount = failedCounter ? Number.parseInt(failedCounter[1] ?? "0", 10) : 0;

  const failures: { name: string; message: string }[] = [];
  // Match BOTH the block form (`>…</UnitTestResult>`, carrying the ErrorInfo body)
  // AND the self-closed form (`… />`): a Failed result without an inner body would
  // otherwise be skipped entirely (audit #9), losing its NAME and making the header
  // count disagree with the listed failures. The error message lives only in
  // <ErrorInfo><Message> (captured stdout is <StdOut>), so the FIRST <Message> in
  // the body is the right one and never picks up another test's output (audit #7).
  const blockRe = /<UnitTestResult\b([^>]*?)(?:\/>|>([\s\S]*?)<\/UnitTestResult>)/g;
  for (let match = blockRe.exec(text); match; match = blockRe.exec(text)) {
    const attrs = match[1] ?? "";
    if (!/\boutcome="Failed"/.test(attrs)) continue;
    const name = attrs.match(/\btestName="([^"]+)"/)?.[1] ?? "";
    const message = (match[2] ?? "").match(/<Message>([\s\S]*?)<\/Message>/)?.[1]?.trim() ?? "";
    failures.push({ name, message });
  }

  const head = `${failedCount || failures.length} failed`;
  if (failures.length === 0) return { output: `${head}\n` };

  // ADR 0001 (audit #2): the failure message is evidence and is NEVER silently
  // clipped (the old `truncate(message, 120)` dropped stack-trace tails). full
  // keeps every message line; step 1 keeps every failing NAME (drops messages);
  // step 2 is a count.
  const render = (withMessage: boolean): string => {
    const out = [head];
    for (const { name, message } of failures) {
      out.push(`  ${name}`);
      if (withMessage && message) {
        for (const line of message.split("\n")) out.push(`    ${line}`);
      }
    }
    return `${out.join("\n")}\n`;
  };

  const ladder = overBudgetLadder({
    full: render(true),
    digest: () => render(false),
    replacement: () => `${head} (over budget)\n`,
  });
  return { output: ladder.text, omission: ladder.omission };
}

// --- dotnet msbuild -bl (binlog text) ---------------------------------------

// RTK: binlog.rs::SENSITIVE_ENV_VARS — redact secret/identity env values.
const SENSITIVE_ENV_VARS = [
  "PATH", "HOME", "USERPROFILE", "USERNAME", "USER", "APPDATA", "LOCALAPPDATA",
  "TEMP", "TMP", "SSH_AUTH_SOCK", "SSH_AGENT_LAUNCHER",
  "GH_TOKEN", "GITHUB_TOKEN", "GITHUB_PAT",
  "NUGET_API_KEY", "NUGET_AUTH_TOKEN", "VSS_NUGET_EXTERNAL_FEED_ENDPOINTS",
  "AZURE_DEVOPS_TOKEN", "AZURE_CLIENT_SECRET", "AZURE_TENANT_ID", "AZURE_CLIENT_ID",
  "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN",
  "API_TOKEN", "AUTH_TOKEN", "ACCESS_TOKEN", "BEARER_TOKEN", "PASSWORD",
  "CONNECTION_STRING", "DATABASE_URL", "DOCKER_CONFIG", "KUBECONFIG",
];

const SENSITIVE_ENV_RE = new RegExp(
  `(\\b(?:${SENSITIVE_ENV_VARS.join("|")})\\s*(?:=|:)\\s*)([^\\s;]+)`,
  "g",
);

// RTK: binlog.rs::scrub_sensitive_env_vars.
function scrubSensitiveEnvVars(input: string): string {
  return input.replace(SENSITIVE_ENV_RE, "$1[REDACTED]");
}

// RTK: binlog.rs::ISSUE_RE + format_issue.
const ISSUE_RE =
  /^\s*([^\r\n:(]+)\((\d+),(\d+)\):\s*(error|warning)\s*(?:([A-Za-z]+\d+)\s*:\s*)?(.*)$/;

function formatDotnetBinlog(text: string): string {
  const scrubbed = scrubSensitiveEnvVars(text);
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const line of scrubbed.split("\n")) {
    const match = line.match(ISSUE_RE);
    if (!match) continue;
    const [, file, lineNo, col, kind, code, msg] = match;
    const formatted = code
      ? `  ${file}(${lineNo},${col}) ${kind} ${code}: ${truncate(msg ?? "", 180)}`
      : `  ${file}(${lineNo},${col}) ${kind}: ${truncate(msg ?? "", 180)}`;
    if (kind === "warning") warnings.push(formatted);
    else errors.push(formatted);
  }

  const out: string[] = [];
  if (errors.length > 0) {
    out.push("Errors:");
    out.push(...errors);
  }
  if (warnings.length > 0) {
    out.push("Warnings:");
    out.push(...warnings);
  }
  return out.length > 0 ? `${out.join("\n")}\n` : scrubbed;
}

// --- dotnet format --verify-no-changes (report JSON) ------------------------

type FormatChange = {
  lineNumber?: number;
  charNumber?: number;
  diagnosticId?: string;
  formatDescription?: string;
};
type FormatEntry = { filePath?: string; changes?: FormatChange[] };

// Accept tk camelCase and RTK PascalCase keys.
function pick<T>(obj: Record<string, unknown>, ...keys: string[]): T | undefined {
  for (const key of keys) {
    if (obj[key] !== undefined) return obj[key] as T;
  }
  return undefined;
}

// RTK: dotnet_format_report.rs::format_dotnet_format_output (check mode).
function formatDotnetFormat(text: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text;
  }

  const root = parsed as Record<string, unknown>;
  const rawFiles = (pick<unknown[]>(root, "files", "Files") ?? (Array.isArray(parsed) ? parsed : [])) as unknown[];

  const entries: { filePath: string; change: FormatChange }[] = [];
  for (const rawFile of rawFiles) {
    if (!rawFile || typeof rawFile !== "object") continue;
    const file = rawFile as Record<string, unknown>;
    const filePath = pick<string>(file, "filePath", "FilePath") ?? "";
    const changes = (pick<unknown[]>(file, "changes", "FileChanges") ?? []) as unknown[];
    const first = changes[0];
    if (!first || typeof first !== "object") continue;
    const change = first as Record<string, unknown>;
    entries.push({
      filePath,
      change: {
        lineNumber: pick<number>(change, "lineNumber", "LineNumber"),
        charNumber: pick<number>(change, "charNumber", "CharNumber"),
        diagnosticId: pick<string>(change, "diagnosticId", "DiagnosticId"),
        formatDescription: pick<string>(change, "formatDescription", "FormatDescription"),
      },
    });
  }

  if (entries.length === 0) return "ok dotnet format: no files need formatting\n";

  const out: string[] = [`Format: ${entries.length} files need formatting`];
  for (const { filePath, change } of entries) {
    const rule = change.diagnosticId || change.formatDescription || "";
    out.push(`  ${filePath} (line ${change.lineNumber ?? 0}, ${rule})`);
  }
  return `${out.join("\n")}\n`;
}

// --- routing ----------------------------------------------------------------

function formatDotnet(
  command: ParsedCommand,
  text: string,
): { output: string; omission?: OmissionDeclaration } {
  const args = command.args;
  const joined = args.join(" ");

  if (args.includes("format")) return { output: formatDotnetFormat(text) };
  if (args.includes("msbuild") || args.includes("-bl") || args.includes("/bl")) {
    return { output: formatDotnetBinlog(text) };
  }

  const looksTrx = text.trimStart().startsWith("<");
  const hasTrxLogger = /--logger[\s:=]+trx/.test(joined) || args.includes("trx");
  if (looksTrx || hasTrxLogger) return formatDotnetTrx(text);
  return formatDotnetTest(text);
}

export const dotnetHandler: CommandHandler = {
  name: "dotnet",
  programs: ["dotnet"],
  matches(command) {
    return command.program === "dotnet";
  },
  execute(command) {
    return executeCommand(command);
  },
  async filter(raw, command, options) {
    const { output, omission } = formatDotnet(command, rawText(raw));
    return makeFilteredResult(this.name, raw, output, options, undefined, omission);
  },
};
