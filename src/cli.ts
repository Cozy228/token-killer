#!/usr/bin/env node
// I5 — shim startup cost. Every shimmed command re-invokes node and loads this
// bundle, so the hot path (`tk git status`) must pull in ONLY the compression
// machinery (router + executor + gate + pipeline). The management subcommands
// (install/inspect/optimize/telemetry/report/…) are loaded with `await import()`
// the moment they're actually requested, keeping them off the per-command path.
// Compile-cache ladder (2.3) — persist V8's compiled bytecode across invocations:
//  - Node ≥22.8: `module.enableCompileCache()` (this call). When the shim wrapper
//    exported NODE_COMPILE_CACHE (2.3) it lands in ~/.token-killer/v8-cache; else
//    Node's default temp dir.
//  - Node 22.1–22.7: the shim wrapper sets NODE_COMPILE_CACHE, which Node honors
//    WITHOUT this API — zero code here, it just works when shimmed.
//  - Node 20–22.0: DEFERRED — needs a `v8-compile-cache` stub, which only hooks the
//    CJS bundle (item 2.2, out of scope). Not silently dropped: that slice pays the
//    uncached compile until 2.2 ships.
import module from "node:module";
try {
  (module as { enableCompileCache?: () => void }).enableCompileCache?.();
} catch {
  // Older Node, or a read-only cache dir — startup cost is unchanged, never fatal.
}

import { parseArgv } from "./parse.js";
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
    "  status      Show install status and refresh the delivery verification timestamp",
    "  hook        Agent-host hook runtime: decide command rewrites & governance",
    "  inspect     Scan your AI setup for token-saving opportunities (opens an HTML report)",
    "  debug       Bundle tk's own diagnostics into one self-contained markdown report",
    "  optimize    Apply the context-file optimizations that inspect found",
    "  gain        Show measured token savings (opens an HTML report)",
    "  config      Manage the tk config file",
    "  telemetry   Opt-in, anonymous network telemetry controls",
    "  support     Send a diagnostic report (recent error + logs) to the maintainer",
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
    "  injection file, usage guidance. Does not change hook or shim installation.",
    "",
    "tk hook <copilot|claude|check <command...>>",
    "  copilot                Hook runtime: read a tool event on stdin, emit a rewrite/governance decision",
    "  claude                 Hook runtime: Claude Code PreToolUse Bash hook — emit a command rewrite",
    "  check <command...>     Dry-run: show how a command would be rewritten (no execution)",
    "  TK_DEBUG=1             Trace the hook runtime (stdin size, decision + why, what was emitted)",
    "                         to stderr AND append it to $TOKEN_KILLER_HOME/debug.log for live",
    "                         `tail -f`. stdout stays clean. Same switch the compress path uses.",
    '                         If the host reports "hook errored", check',
    "                         $TOKEN_KILLER_HOME/errors.log — fatal crashes are logged there",
    "                         unconditionally (no TK_DEBUG needed).",
    "",
    "tk inspect [--text] [--json] [--since 7d] [--session <id>] [--input-type vscode|copilot-cli]",
    "           [--advice] [--write-advice] [--min-confidence n] [--min-occurrences n]",
    "           [--project|--user] [--surface instructions|prompts|agents|skills] [--fail-on info|warn|error]",
    "  Read-only scan of your AI setup for missed token savings; ranks the opportunities.",
    "  Opens a single-file HTML report in your browser by default.",
    "  Shows per-phase progress on stderr when interactive (TK_NO_PROGRESS=1 to silence).",
    "  --text                       Print the report to the terminal instead of opening HTML",
    "  --json                       Output JSON instead",
    "  --since <window>             Only sessions newer than e.g. 7d, 24h, 30m",
    "  --session <id>               Restrict to one session",
    "  --input-type <type>          Override source detection (vscode | copilot-cli)",
    "  --advice                     Produce actionable advice findings, not just opportunities",
    "  --write-advice               Write advice artifacts to disk",
    "  --min-confidence <n>         Drop advice below confidence n",
    "  --min-occurrences <n>        Drop advice seen fewer than n times",
    "  --project | --user           Static-context scope (default: user)",
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
    "tk optimize [--apply] [--backup [files...]] [--restore]",
    "            [--surface <name>] [--project|--user]",
    "  Applies the context-file optimizations inspect found (including token-lean VS Code",
    "  settings). Read-only unless --apply. Scope is git-aware: outside a git repo it works",
    "  on your user-level files; inside a git repo it works on both the project and user files.",
    "  (default)              Preview: print the full plan, write nothing",
    "  --apply                Apply every deterministic change. Discloses the full plan,",
    "                         backs up each file first; free-form suggestions are printed,",
    "                         not written. Revert with --restore.",
    "  --backup [files...]    Snapshot files before editing them by hand (or via an agent),",
    "                         so --restore can revert those edits. No files = all in-scope.",
    "  --restore              Revert the most recent backup (from --apply or --backup)",
    "  --surface <name>       Restrict to one surface (instructions|prompts|agents|skills)",
    "  --project | --user     Force a single scope instead of the git-aware default",
    "",
    "tk gain [--user] [--text] [--json] [--csv]",
    "        [--daily|--weekly|--monthly|--all] [--graph] [--history [n]] [--failures] [--quota [-t <model>]]",
    "  Measured token savings. Defaults to the current project; --user aggregates all.",
    "  Opens a single-file HTML report in your browser by default — the four views side by side",
    "  (measured / optimizer / governance / quality), never summed.",
    "    --text          Print the savings summary to the terminal instead of opening HTML",
    "    --json          Output JSON instead",
    "    --csv           Output CSV (for scripts / spreadsheets)",
    "    --daily|--weekly|--monthly|--all   Bucket savings by period (terminal output)",
    "    --graph         Add a sparkline trend (terminal output)",
    "    --history [n]   Show the last n records, default 10 (terminal output)",
    "    --failures      Show the failure breakdown (terminal output)",
    "    --quota [-t m]  Show quota usage; -t overrides the pricing model (terminal output)",
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
    "tk support [email|teams|github] [--email <addr>] [--teams <upn>] [--github <owner/repo>] [--no-attach] [--redact] [-y]",
    "  Gather the recent error + logs into one shareable report and open your mail",
    "  client (mailto:), Microsoft Teams (msteams: scheme), or a GitHub issue draft to",
    "  send it. Nothing is sent automatically — you review and send by hand; the report",
    "  is saved under ~/.token-killer/reports/. Routing is env-only: set TK_SUPPORT_EMAIL,",
    "  TK_SUPPORT_TEAMS (an in-tenant UPN), or TK_SUPPORT_GITHUB (an owner/repo). With",
    "  none set, tk saves the bundle and copies it to your clipboard, then prints a hint —",
    "  it sends nowhere.",
    "",
    "Flags for `tk <command...>` (the compression proxy):",
    "  --raw                 Print raw stdout/stderr (no compression)",
    "  --stats               Append a token-savings summary (and the saved raw-output path)",
    "  --max-lines <n>       Limit compressed output to n lines",
    "  --max-chars <n>       Limit compressed output to n chars",
    "  --save-raw            Always save the raw output",
    "  --no-save-raw         Never save the raw output",
    "  --help                Show this help",
    "  --version             Show the tk version",
    "  TK_NO_HISTORY=1       Skip writing the measured-savings history row (lowest",
    "                        per-command latency; `tk gain` will not see those commands)",
    "",
  ].join("\n");
}

async function recordRawPassthrough(raw: RawResult, options: TkOptions): Promise<FilteredResult> {
  const [{ calculateSavings }, { maybeSaveRawOutput }, { recordHistory }] = await Promise.all([
    import("./core/savings.js"),
    import("./core/rawStore.js"),
    import("./core/history.js"),
  ]);
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
  return filtered;
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
  // Management subcommands — lazily imported so the compression hot path never pays
  // to load them (I5). Each branch loads exactly the module it dispatches to.
  if (parsed.mode === "install") {
    return (await import("./shim/init.js")).runInstall(parsed.subArgs ?? []);
  }
  if (parsed.mode === "uninstall") {
    return (await import("./shim/init.js")).runUninstall(parsed.subArgs ?? []);
  }
  if (parsed.mode === "status") {
    return (await import("./shim/init.js")).runStatus(parsed.subArgs ?? []);
  }
  if (parsed.mode === "shim") {
    return (await import("./shim/cli.js")).runShim(parsed.subArgs ?? []);
  }
  if (parsed.mode === "hook") {
    return (await import("./hook/cli.js")).runHook(parsed.subArgs ?? []);
  }
  if (parsed.mode === "inspect") {
    return (await import("./inspect/cli.js")).runInspect(parsed.subArgs ?? []);
  }
  if (parsed.mode === "debug") {
    return (await import("./debug/cli.js")).runDebug(parsed.subArgs ?? []);
  }
  if (parsed.mode === "optimize") {
    return (await import("./context/optimizeCli.js")).runOptimize(parsed.subArgs ?? []);
  }
  if (parsed.mode === "gain") {
    return (await import("./core/gain.js")).runGain(parsed.subArgs ?? [], parsed.options.cwd);
  }
  if (parsed.mode === "config") {
    return (await import("./core/configCli.js")).runConfig(parsed.subArgs ?? []);
  }
  if (parsed.mode === "telemetry") {
    return (await import("./telemetry/cli.js")).runTelemetry(parsed.subArgs ?? []);
  }
  if (parsed.mode === "support") {
    return (await import("./support/cli.js")).runSupport(parsed.subArgs ?? []);
  }
  if (!parsed.command) {
    // Bare `tk` (or flags with no command to run) has nothing to execute — print
    // the usage summary like `--help` rather than a bare error, so a curious user
    // who just types `tk` lands on the command list.
    process.stdout.write(help());
    return 0;
  }

  const command = parsed.command;

  // --raw: print the real tool's output with NO compression. By default this now
  // STREAMS via inherited stdio (executePassthrough) — the lightest path: no pipe,
  // no decode, no per-byte capture, and output appears live instead of all at once
  // when the child exits. We only fall back to the heavier capture-then-print path
  // when accounting genuinely needs the bytes: `--stats` (token summary) or an
  // explicit `--save-raw` (persist the raw log). `--no-save-raw`/auto-save never
  // forces capture — streaming is the point of plain `--raw`.
  if (parsed.options.raw) {
    const [{ replaceFootgunBanner }, { executePassthrough }, { recordRawLitePassthrough }] =
      await Promise.all([
        import("./handlers/common/searchLike.js"),
        import("./executor.js"),
        import("./core/history.js"),
      ]);
    // Correctness advisory for a misused `rg -r` (silently --replace). Goes to STDERR
    // so stdout stays byte-verbatim — the whole point of --raw — while still warning.
    // Needs only program+args, so it works on the streaming path too.
    const footgunBanner = replaceFootgunBanner(command.program, command.args);
    const needsCapture = parsed.options.stats || parsed.options.saveRaw === true;

    if (!needsCapture) {
      // Streaming path: inherited stdio, restore live output, capture nothing.
      const started = Date.now();
      const exitCode = await executePassthrough(command);
      if (footgunBanner !== null) process.stderr.write(`${footgunBanner}\n`);
      // Best-effort accounting; a write failure must never override the real exit
      // code (C6). The light row records only what we truly know — exit code +
      // duration — and omits byte/token counts we never captured (no fake sizes).
      try {
        await recordRawLitePassthrough({
          command: command.displayCommand,
          exitCode,
          durationMs: Date.now() - started,
          cwd: parsed.options.cwd,
          sessionId: parsed.options.sessionId,
        });
      } catch {
        /* drop the accounting row; never alter the command's outcome */
      }
      return exitCode;
    }

    // Capture path: --stats / --save-raw need the actual bytes. Uses the full router
    // so every command (including generic fall-throughs) is captured and reprinted.
    const [{ routeCommand }, { formatStats }] = await Promise.all([
      import("./router.js"),
      import("./core/stats.js"),
    ]);
    const handler = routeCommand(command);
    const raw = await handler.execute(command, parsed.options);
    process.stdout.write(raw.stdout);
    process.stderr.write(raw.stderr);
    if (footgunBanner !== null) process.stderr.write(`${footgunBanner}\n`);
    // Best-effort accounting; a write failure must never override the real exit code
    // (C6) — the command already ran and its output is already on stdout/stderr.
    try {
      const filtered = await recordRawPassthrough(raw, parsed.options);
      // --stats is what forced this capture path, so it must actually report (P2): the
      // savings summary (and any saved raw-output path) goes to STDERR so stdout stays
      // byte-verbatim — the whole contract of --raw. Savings are 0% (raw is uncompressed),
      // which is the honest figure.
      if (parsed.options.stats) process.stderr.write(`\n${formatStats(filtered)}\n`);
    } catch {
      /* drop the accounting row; never alter the command's outcome */
    }
    return raw.exitCode;
  }

  const [
    { routeSpecific },
    { isShimmableProgram },
    { gateDecision },
    { isInteractive },
    { tkDebug },
    { executePassthrough },
  ] = await Promise.all([
    import("./router.js"),
    import("./shim/programs.js"),
    import("./shim/gate.js"),
    import("./shim/interactive.js"),
    import("./hook/debug.js"),
    import("./executor.js"),
  ]);
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
  const [{ runPipeline }, { emitThenCommit }, { tkDebug }] = await Promise.all([
    import("./core/pipeline.js"),
    import("./core/emit.js"),
    import("./hook/debug.js"),
  ]);
  const raw = await handler.execute(command, options);

  // The command has now run exactly once. Everything past this point (filtering,
  // accounting, printing) must NEVER propagate to the cli fail-open catch, which
  // re-spawns the command via passthrough — that would double-execute side effects
  // (C6). Post-execution failures are absorbed here: ship the captured raw and
  // preserve the exit code. Pre-execution failures (handler.execute throwing before
  // the child runs — ENOENT, ShimRecursionError) still reach the fail-open, where a
  // re-spawn is correct because nothing ran.
  try {
    const result = await runPipeline(
      {
        ...handler,
        async execute() {
          return raw;
        },
      },
      command,
      options,
    );
    const filtered = result.filtered;

    // Compress succeeded — trace the savings to the same dual sink as the gate
    // decision (D1), so a live `TK_DEBUG` session shows route → outcome in one log.
    tkDebug("compress", {
      handler: filtered.handler,
      rawTokens: filtered.rawTokens,
      outTokens: filtered.outputTokens,
      savedPct: filtered.savingsPct,
    });

    return await emitThenCommit(filtered, raw, command, options, result.commit);
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
    const { executePassthrough } = await import("./executor.js");
    return await executePassthrough(command);
  } catch {
    // Passthrough is also impossible (e.g. the real tool only exists inside the
    // shim dir — true recursion). Surface the original error and exit non-zero
    // with a deterministic code, never an unhandled rejection. This is tk's OWN
    // failure (the wrapped tool never ran), so nudge toward `tk support`.
    const { emitSupportHintOnce } = await import("./hook/debug.js");
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    emitSupportHintOnce();
    return 1;
  }
}

try {
  process.exitCode = await main();
} catch (error) {
  // A throw here means tk exited non-zero — for a hook invocation the host swallows
  // stderr and surfaces only "PreToolUse hook errored". Persist the reason to
  // errors.log (unconditionally, not gated on TK_DEBUG) so there is a breadcrumb to
  // read after the fact. logFatalError also writes stderr, so this replaces the bare
  // stderr write above.
  const { logFatalError } = await import("./hook/debug.js");
  logFatalError(`tk ${process.argv.slice(2).join(" ")}`, error);
  process.exitCode = 1;
}
