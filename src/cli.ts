#!/usr/bin/env node
import { parseArgv } from "./parse.js";
import { routeCommand, routeSpecific } from "./router.js";
import { executePassthrough } from "./executor.js";
import { shouldCompress } from "./shim/gate.js";
import { runInit } from "./shim/init.js";
import { runHook } from "./hook/cli.js";
import { runInspect } from "./inspect/cli.js";
import { runOptimize } from "./context/optimizeCli.js";
import { buildReport } from "./core/report.js";
import { runReport } from "./core/ledger.js";
import { runGain } from "./core/gain.js";
import { runConfig } from "./core/configCli.js";
import { runTelemetry } from "./telemetry/cli.js";
import { runPipeline } from "./core/pipeline.js";
import { recordHistory } from "./core/history.js";
import { calculateSavings } from "./core/savings.js";
import { maybeSaveRawOutput } from "./core/rawStore.js";
import { formatStats } from "./core/stats.js";
import { failureHint } from "./core/failureHints.js";
import { VERSION } from "./version.js";
import type {
  CommandHandler,
  FilteredResult,
  ParsedCommand,
  RawResult,
  TkOptions,
} from "./types.js";

function help(): string {
  return [
    "tk — Token Killer: a CLI proxy that compresses dev-command output so coding",
    "agents spend far fewer tokens. Wrap any command, or manage tk's delivery and reports.",
    "",
    "Usage:",
    "  tk [flags] <command...>     Run a command through tk and compress its output",
    "  tk <subcommand> [options]   Manage delivery, inspect savings, configure tk",
    "",
    "Commands:",
    "  init        Install & manage tk delivery into your agent host (hook / shim / injection)",
    "  hook        Agent-host hook runtime: decide command rewrites & governance",
    "  inspect     Scan agent history for token-saving opportunities; print a ranked report",
    "  optimize    Apply the context-file optimizations that inspect found",
    "  gain        Show measured token savings (totals, trends, failures, quota)",
    "  config      Manage the tk config file",
    "  telemetry   Opt-in, anonymous network telemetry controls",
    "",
    "Run `tk <command> --help`-style usage is summarized below.",
    "",
    "tk init [--host auto|claude-code|copilot-cli|vscode] [--project] [--show] [--dry-run] [--uninstall]",
    "  Auto-detects the host and wires the best delivery tier (hook > shim > injection).",
    "  --host <h>     Force the host instead of auto-detecting (claude-code patches",
    "                 ~/.claude/settings.json's PreToolUse Bash hook)",
    "  --project      Also write project-level instructions into the current repo",
    "  --show         Show current install status (host, hook, shim, injection)",
    "  --dry-run      Preview what would change without writing",
    "  --uninstall    Remove everything tk installed (hook config, shim, injection)",
    "  tk init shim <install|status|uninstall>   Manually control the shim tier (shell PATH + VS Code)",
    "",
    "tk hook <copilot|claude|check <command...>>",
    "  copilot                Hook runtime: read a tool event on stdin, emit a rewrite/governance decision",
    "  claude                 Hook runtime: Claude Code PreToolUse Bash hook — emit a command rewrite",
    "  check <command...>     Dry-run: show how a command would be rewritten (no execution)",
    "  TK_DEBUG=1             Trace the hook runtime (stdin size, decision + why, what was emitted)",
    "                         to stderr AND append it to $TOKEN_KILLER_HOME/debug.log for live",
    "                         `tail -f`. stdout stays clean. Same switch the compress path uses.",
    "",
    "tk inspect [--json] [--since 7d] [--session <id>] [--input-type vscode|copilot-cli] [--repo-context]",
    "           [--advice] [--write-advice] [--telemetry-export|--no-telemetry-export]",
    "           [--min-confidence n] [--min-occurrences n] [--project|--user] [--copilot-context]",
    "           [--surface instructions|prompts|agents|skills] [--fail-on info|warn|error]",
    "  Read-only scan of agent history for missed token savings; emits a ranked opportunity report.",
    "  --json                       Output JSON instead of text",
    "  --since <window>             Only sessions newer than e.g. 7d, 24h, 30m",
    "  --session <id>               Restrict to one session",
    "  --input-type <type>          Override source detection (vscode | copilot-cli)",
    "  --repo-context               Include repo context in the report",
    "  --advice                     Produce actionable advice findings, not just opportunities",
    "  --write-advice               Write advice artifacts to disk",
    "  --telemetry-export           Force-write the local telemetry aggregate (--no- to disable)",
    "  --min-confidence <n>         Drop advice below confidence n",
    "  --min-occurrences <n>        Drop advice seen fewer than n times",
    "  --project | --user           Static-context scope (default: user)",
    "  --copilot-context            Static-context analysis only (skip the runtime scan)",
    "  --surface <s>                Restrict to one surface (instructions|prompts|agents|skills)",
    "  --fail-on <severity>         Exit non-zero when a finding reaches info|warn|error",
    "",
    "tk optimize [--dry-run] [--apply] [--restore] [--write-advice] [--token-budget-block]",
    "            [--surface <name>] [--project|--user] [--vscode-settings]",
    "  Applies the context-file optimizations inspect found. Read-only unless --apply.",
    "  Scope is git-aware: outside a git repo it works on your user-level files; inside",
    "  a git repo it works on both the project and user files.",
    "  (default)              Dry-run: print the full plan, write nothing",
    "  --apply                Apply every deterministic change. Discloses the full plan,",
    "                         backs up each file first; free-form suggestions are printed,",
    "                         not written. Revert with --restore.",
    "  --restore              Revert the most recent --apply from its backup",
    "  --write-advice         Write the context advice file instead of planning inline",
    "  --token-budget-block   Install the managed token-budget block into your user-level",
    "                         instructions (--restore removes it). Replaces `tk agentsmd`.",
    "  --surface <name>       Restrict to one surface (instructions|prompts|agents|skills)",
    "  --project | --user     Force a single scope instead of the git-aware default",
    "  --vscode-settings      Apply token-lean VS Code settings (--apply / --restore)",
    "",
    "tk gain [--user] [--daily|--weekly|--monthly|--all] [--graph] [--history [n]]",
    "        [--failures] [--quota [-t <model>]] [--json|--csv|--format json|csv|text]",
    "tk gain report [--scope user|project|runtime] [--project|--user] [--since <date>] [--json]",
    "  gain          Measured token savings. Defaults to the current project; --user aggregates all.",
    "    --daily|--weekly|--monthly|--all   Bucket savings by period",
    "    --graph         Add a sparkline trend",
    "    --history [n]   Show the last n records (default 10)",
    "    --failures      Show the failure breakdown",
    "    --quota [-t m]  Show quota usage; -t overrides the pricing model",
    "  gain report   Detailed savings — four views side by side (measured / optimizer / governance / quality), never summed.",
    "",
    "tk config <init|show|path>",
    "  init    Create the config file from the template",
    "  show    Print the current config as JSON",
    "  path    Print the config file path",
    "",
    "tk telemetry <enable|disable|status|preview>",
    "  enable     Opt in to anonymous network telemetry uploads",
    "  disable    Opt out of network uploads",
    "  status     Show consent state and anonymous device id (no network check)",
    "  preview    Print the exact payload that would be sent (sends nothing)",
    "",
    "Flags for `tk <command...>` (the compression proxy):",
    "  --raw                 Print raw stdout/stderr (no compression)",
    "  --stats               Append a token-savings summary",
    "  --verbose             Append token savings and the saved raw-output path",
    "  --max-lines <n>       Limit compressed output to n lines",
    "  --max-chars <n>       Limit compressed output to n chars",
    "  --save-raw            Always save the raw output",
    "  --no-save-raw         Never save the raw output",
    "  --report [--json|--csv]   Legacy aggregate report",
    "  --help                Show this help",
    "  --version             Show the tk version",
    "",
  ].join("\n");
}

async function recordRawPassthrough(raw: RawResult, options: TkOptions): Promise<void> {
  const output = `${raw.stdout}${raw.stderr}`;
  const savings = calculateSavings(output, output);
  const rawOutputPath = await maybeSaveRawOutput(raw, options);
  const filtered: FilteredResult = {
    handler: "raw",
    output,
    rawChars: savings.rawChars,
    outputChars: savings.outputChars,
    rawTokens: savings.rawTokens,
    outputTokens: savings.outputTokens,
    savedTokens: savings.savedTokens,
    savingsPct: savings.savingsPct,
    rawOutputPath,
    exitCode: raw.exitCode,
    qualityStatus: "passed",
  };
  await recordHistory(raw, filtered, options);
}

async function main(): Promise<number> {
  const parsed = parseArgv(process.argv.slice(2));
  parsed.options.cwd = process.cwd();

  if (parsed.mode === "help") {
    process.stdout.write(help());
    return 0;
  }
  if (parsed.mode === "version") {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }
  if (parsed.mode === "report") {
    process.stdout.write(await buildReport(parsed.options));
    return 0;
  }
  if (parsed.mode === "init") {
    return runInit(parsed.subArgs ?? []);
  }
  if (parsed.mode === "hook") {
    return runHook(parsed.subArgs ?? []);
  }
  if (parsed.mode === "inspect") {
    return runInspect(parsed.subArgs ?? []);
  }
  if (parsed.mode === "optimize") {
    return runOptimize(parsed.subArgs ?? []);
  }
  if (parsed.mode === "gain") {
    const sub = parsed.subArgs ?? [];
    // `tk gain report` — the detailed multi-view savings report (second layer
    // under `gain`). `tk report` stays as a back-compat alias (see parse.ts).
    if (sub[0] === "report") {
      return runReport(sub.slice(1));
    }
    return runGain(sub, parsed.options.cwd);
  }
  if (parsed.mode === "config") {
    return runConfig(parsed.subArgs ?? []);
  }
  if (parsed.mode === "telemetry") {
    return runTelemetry(parsed.subArgs ?? []);
  }
  if (!parsed.command) {
    process.stderr.write("tk: missing command\n");
    return 1;
  }

  const command = parsed.command;

  // --raw: capture-then-print, unchanged. Uses the full router so every command
  // (including generic fall-throughs) is captured and reprinted. Distinct from
  // passthrough, which inherits stdio and never captures.
  if (parsed.options.raw) {
    const handler = routeCommand(command);
    const raw = await handler.execute(command, parsed.options);
    process.stdout.write(raw.stdout);
    process.stderr.write(raw.stderr);
    await recordRawPassthrough(raw, parsed.options);
    return raw.exitCode;
  }

  // Shim gate (ADR 0002 §2-3): compress only on a specific match AND non-TTY
  // stdout AND a non-interactive command. Everything else — generic
  // fall-throughs, a human-watched TTY, interactive commands — passes through to
  // the real tool with inherited stdio.
  const handler = routeSpecific(command);
  if (!handler || !shouldCompress(command, Boolean(process.stdout.isTTY), handler)) {
    return executePassthrough(command);
  }

  // Fail toward the real tool (the load-bearing guardrail): any compression or
  // executor error — including ShimRecursionError — falls back to passthrough of
  // the real tool. If even that is impossible (genuine recursion), print a clear
  // one-line error and exit non-zero. Never crash, never block the command.
  try {
    return await runCompress(handler, command, parsed.options);
  } catch (error) {
    // The fail-open is silent by design (never surface compression noise to the
    // agent). TK_DEBUG opens a window into WHY a command fell back to passthrough
    // — essential for diagnosing platform-specific compress-path failures.
    if (process.env.TK_DEBUG) {
      process.stderr.write(
        `tk debug: compress failed for "${command.displayCommand}": ${
          error instanceof Error ? (error.stack ?? error.message) : String(error)
        }\n`,
      );
    }
    return await failOpenPassthrough(command, error);
  }
}

async function runCompress(
  handler: CommandHandler,
  command: ParsedCommand,
  options: TkOptions,
): Promise<number> {
  const raw = await handler.execute(command, options);

  const filtered = await runPipeline(
    {
      ...handler,
      async execute() {
        return raw;
      },
    },
    command,
    options,
  ).then((result) => result.filtered);

  process.stdout.write(filtered.output);
  if (filtered.output.length > 0 && !filtered.output.endsWith("\n")) {
    process.stdout.write("\n");
  }

  // Inline failure-fix hint (scheme 2): presentation-layer only — appended after
  // the compressed output, never part of it, so it can't trip the quality gate.
  if (raw.exitCode !== 0) {
    const hint = failureHint(raw, command);
    if (hint) process.stdout.write(`tk hint: ${hint}\n`);
  }

  if (options.stats || options.verbose) {
    process.stdout.write(`\n${formatStats(filtered)}\n`);
  }
  return raw.exitCode;
}

async function failOpenPassthrough(command: ParsedCommand, error: unknown): Promise<number> {
  try {
    return await executePassthrough(command);
  } catch {
    // Passthrough is also impossible (e.g. the real tool only exists inside the
    // shim dir — true recursion). Surface the original error and exit non-zero
    // with a deterministic code, never an unhandled rejection.
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
