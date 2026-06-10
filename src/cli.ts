#!/usr/bin/env node
import { parseArgv } from "./parse.js";
import { routeCommand, routeSpecific } from "./router.js";
import { executePassthrough } from "./executor.js";
import { gateDecision } from "./shim/gate.js";
import { isInteractive } from "./shim/interactive.js";
import { runInstall, runStatus, runUninstall } from "./shim/init.js";
import { runShim } from "./shim/cli.js";
import { isShimmableProgram } from "./shim/programs.js";
import { tkDebug } from "./hook/debug.js";
import { runHook } from "./hook/cli.js";
import { runInspect } from "./inspect/cli.js";
import { runDebug } from "./debug/cli.js";
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
import { limitOutput } from "./core/outputLimit.js";
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
    "  install     Install tk delivery into your agent host (hook / shim / injection)",
    "  uninstall   Remove everything tk installed (optionally purge measured data)",
    "  status      Show current install status (host, hook, shim, injection) — no writes",
    "  shim        Manually control the shim tier (shell PATH + VS Code)",
    "  hook        Agent-host hook runtime: decide command rewrites & governance",
    "  inspect     Scan agent history for token-saving opportunities; print a ranked report",
    "  debug       Bundle tk's own diagnostics into one self-contained markdown report",
    "  optimize    Apply the context-file optimizations that inspect found",
    "  gain        Show measured token savings (totals, trends, failures, quota)",
    "  config      Manage the tk config file",
    "  telemetry   Opt-in, anonymous network telemetry controls",
    "",
    "Run `tk <command> --help`-style usage is summarized below.",
    "",
    "tk install [--host auto|claude-code|copilot-cli|vscode] [--project] [--dry-run]",
    "  Auto-detects the host and wires the best delivery tier (hook > shim > injection),",
    "  and drops a usage guide (TK.md) referenced from the host's agent instructions.",
    "  For VS Code it also writes TK_COMPRESS_TTY=1 into the integrated-terminal env so",
    "  the agent's commands compress even though they run in a TTY.",
    "  --host <h>     Force the host instead of auto-detecting (claude-code patches",
    "                 ~/.claude/settings.json's PreToolUse Bash hook)",
    "  --project      Also write project-level instructions into the current repo",
    "  --dry-run      Preview what would change without writing",
    "",
    "tk uninstall [--project] [--purge-data] [--dry-run]",
    "  Remove everything tk installed (hook config, shim, injection, TK.md). Preserves",
    "  your measured-savings data by default.",
    "  --purge-data   Also delete ~/.token-killer/projects/ (your metrics history)",
    "  --project      Remove only the current repo's artifacts (not the user install)",
    "  --dry-run      Report what would be removed without deleting",
    "",
    "tk status",
    "  Show the current install: detected host, claude/copilot hook config, shim status,",
    "  injection file, usage guidance. Read-only — writes nothing.",
    "",
    "tk shim <install|status|uninstall> [--dry-run]",
    "  Manually control the shim tier (shell PATH + VS Code). `tk install` already wires",
    "  the shim as part of its tier ladder; this is the advanced/debug path.",
    "",
    "tk hook <copilot|claude|check <command...>>",
    "  copilot                Hook runtime: read a tool event on stdin, emit a rewrite/governance decision",
    "  claude                 Hook runtime: Claude Code PreToolUse Bash hook — emit a command rewrite",
    "  check <command...>     Dry-run: show how a command would be rewritten (no execution)",
    "  TK_DEBUG=1             Trace the hook runtime (stdin size, decision + why, what was emitted)",
    "                         to stderr AND append it to $TOKEN_KILLER_HOME/debug.log for live",
    "                         `tail -f`. stdout stays clean. Same switch the compress path uses.",
    "",
    "tk inspect [--json] [--html] [--since 7d] [--session <id>] [--input-type vscode|copilot-cli] [--repo-context]",
    "           [--advice] [--write-advice] [--telemetry-export|--no-telemetry-export]",
    "           [--min-confidence n] [--min-occurrences n] [--project|--user] [--copilot-context]",
    "           [--surface instructions|prompts|agents|skills] [--fail-on info|warn|error]",
    "  Read-only scan of agent history for missed token savings; emits a ranked opportunity report.",
    "  --json                       Output JSON instead of text",
    "  --html                       Write a single-file HTML report and open it in your browser",
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
    "tk debug [--out <path>] [--full] [--redact]",
    "  Run once on a tester's machine to produce ONE self-contained markdown bundle",
    "  diagnosing tk itself (version stamp, delivery health, command history, anomaly",
    "  payloads, usage aggregates, debug.log + host configs). Reviews tk, not your agent",
    "  history (that's `inspect`). No network, no telemetry — writes only the --out file.",
    "  --out <path>   Destination (default: reports/debug-<ts>.md)",
    "  --full         Attach every row's payload, not just anomalies'",
    "  --redact       Length/label only — no command text, payload bytes, or config bodies",
    "",
    "tk optimize [--dry-run] [--apply] [--backup [files...]] [--restore] [--write-advice]",
    "            [--token-budget-block] [--surface <name>] [--project|--user] [--vscode-settings]",
    "  Applies the context-file optimizations inspect found. Read-only unless --apply.",
    "  Scope is git-aware: outside a git repo it works on your user-level files; inside",
    "  a git repo it works on both the project and user files.",
    "  (default)              Dry-run: print the full plan, write nothing",
    "  --apply                Apply every deterministic change. Discloses the full plan,",
    "                         backs up each file first; free-form suggestions are printed,",
    "                         not written. Revert with --restore.",
    "  --backup [files...]    Snapshot files before editing them by hand (or via an agent),",
    "                         so --restore can revert those edits. No files = all in-scope.",
    "  --restore              Revert the most recent backup (from --apply or --backup)",
    "  --write-advice         Write the context advice file instead of planning inline",
    "  --token-budget-block   Install the managed token-budget block into your user-level",
    "                         instructions (--restore removes it). Replaces `tk agentsmd`.",
    "  --surface <name>       Restrict to one surface (instructions|prompts|agents|skills)",
    "  --project | --user     Force a single scope instead of the git-aware default",
    "  --vscode-settings      Apply token-lean VS Code settings (--apply / --restore)",
    "",
    "tk gain [--user] [--daily|--weekly|--monthly|--all] [--graph] [--history [n]]",
    "        [--failures] [--quota [-t <model>]] [--json|--csv|--format json|csv|text]",
    "tk gain report [--scope user|project|runtime] [--project|--user] [--since <date>] [--text|--json]",
    "  gain          Measured token savings. Defaults to the current project; --user aggregates all.",
    "    --daily|--weekly|--monthly|--all   Bucket savings by period",
    "    --graph         Add a sparkline trend",
    "    --history [n]   Show the last n records (default 10)",
    "    --failures      Show the failure breakdown",
    "    --quota [-t m]  Show quota usage; -t overrides the pricing model",
    "  gain report   Detailed savings — four views side by side (measured / optimizer / governance / quality), never summed.",
    "                Opens a single-file HTML report in your browser by default; use --text or --json for terminal output.",
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
    "  --no-dedup            Disable session dedup for this command (ADR 0009)",
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
  if (parsed.mode === "install") {
    return runInstall(parsed.subArgs ?? []);
  }
  if (parsed.mode === "uninstall") {
    return runUninstall(parsed.subArgs ?? []);
  }
  if (parsed.mode === "status") {
    return runStatus(parsed.subArgs ?? []);
  }
  if (parsed.mode === "shim") {
    return runShim(parsed.subArgs ?? []);
  }
  if (parsed.mode === "hook") {
    return runHook(parsed.subArgs ?? []);
  }
  if (parsed.mode === "inspect") {
    return runInspect(parsed.subArgs ?? []);
  }
  if (parsed.mode === "debug") {
    return runDebug(parsed.subArgs ?? []);
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
    // Bare `tk` (or flags with no command to run) has nothing to execute — print
    // the usage summary like `--help` rather than a bare error, so a curious user
    // who just types `tk` lands on the command list.
    process.stdout.write(help());
    return 0;
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
    // Best-effort accounting; a write failure must never override the real exit code
    // (C6) — the command already ran and its output is already on stdout/stderr.
    try {
      await recordRawPassthrough(raw, parsed.options);
    } catch {
      /* drop the accounting row; never alter the command's outcome */
    }
    return raw.exitCode;
  }

  const handler = routeSpecific(command);

  // Passthrough hardening (U2). A DIRECT `tk <x>` — the shell did NOT resolve a
  // real tool through the shim, so TK_SHIM_DIR is unset — may run a binary only
  // when `<x>` is something tk genuinely fronts: a routable handler, or a known
  // shimmable dev tool (covers probe forms like `git --version`). An unknown word
  // is NEVER auto-spawned on PATH — that is the bug that ran Bandizip's
  // `uninstall.EXE`. Shim-invoked passthrough (TK_SHIM_DIR set — the shell already
  // resolved a real tool the user ran) stays transparent and UNCHANGED, so it
  // still covers shimmable tools without a specific handler (e.g. curl). `--raw`
  // (handled above) is the explicit escape hatch to force-run anything.
  const shimInvoked = Boolean(process.env.TK_SHIM_DIR);
  if (!shimInvoked && !handler && !isShimmableProgram(command.program)) {
    if (command.program === "init") {
      process.stderr.write("tk: `tk init` was renamed to `tk install` (see `tk --help`).\n");
    } else {
      process.stderr.write(
        `tk: unknown command "${command.program}" — tk wraps known dev tools; ` +
          `use \`tk --raw ${command.displayCommand}\` to run it anyway\n`,
      );
    }
    return 1;
  }

  // Shim gate (ADR 0002 §2-3, R1): compress only on a specific match AND a
  // non-interactive command AND either non-TTY stdout or an opted-in TK_COMPRESS_TTY
  // terminal. Everything else passes through to the real tool with inherited stdio.
  // The gate decision (+reason) is the single most diagnostic event in the system —
  // trace it so `TK_DEBUG` answers "why wasn't this compressed?" from debug.log
  // alone, on the exact (VS Code) path where stderr is invisible (D1).
  const isTTY = Boolean(process.stdout.isTTY);
  const decision = gateDecision(command, isTTY, handler);
  tkDebug("gate", {
    command: command.displayCommand,
    handler: handler?.name,
    isTTY,
    interactive: isInteractive(command),
    willCompress: decision.willCompress,
    reason: decision.reason,
  });
  // willCompress is only ever true for a specific match (gateDecision returns
  // "no-handler" when match is null), so handler is non-null here — the guard both
  // narrows the type and stays a correct no-op fallback to passthrough.
  if (!decision.willCompress || !handler) {
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
    // — essential for diagnosing platform-specific compress-path failures. Routed
    // through the dual-sink tkDebug so it also lands in debug.log, not just the
    // stderr the VS Code agent can't see (D1).
    tkDebug("compress-failed", {
      command: command.displayCommand,
      error: error instanceof Error ? (error.stack ?? error.message) : String(error),
    });
    return await failOpenPassthrough(command, error);
  }
}

async function runCompress(
  handler: CommandHandler,
  command: ParsedCommand,
  options: TkOptions,
): Promise<number> {
  const raw = await handler.execute(command, options);

  // The command has now run exactly once. Everything past this point (filtering,
  // accounting, printing) must NEVER propagate to the cli fail-open catch, which
  // re-spawns the command via passthrough — that would double-execute side effects
  // (C6). Post-execution failures are absorbed here: ship the captured raw and
  // preserve the exit code. Pre-execution failures (handler.execute throwing before
  // the child runs — ENOENT, ShimRecursionError) still reach the fail-open, where a
  // re-spawn is correct because nothing ran.
  try {
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

    // Compress succeeded — trace the savings to the same dual sink as the gate
    // decision (D1), so a live `TK_DEBUG` session shows route → outcome in one log.
    tkDebug("compress", {
      handler: filtered.handler,
      rawTokens: filtered.rawTokens,
      outTokens: filtered.outputTokens,
      savedPct: filtered.savingsPct,
    });

    // Apply the opt-in --max-lines/--max-chars caps to the FINAL output (H18). A no-op
    // unless the user passed a finite limit; never touches the quality gate above.
    const display = limitOutput(filtered.output, options);
    process.stdout.write(display);
    if (display.length > 0 && !display.endsWith("\n")) {
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
  } catch {
    // Post-execution fallback: the command already ran; surface its captured output
    // verbatim and preserve the exit code. Never re-spawn (C6).
    process.stdout.write(raw.stdout);
    process.stderr.write(raw.stderr);
    return raw.exitCode;
  }
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
