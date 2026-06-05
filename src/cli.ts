#!/usr/bin/env node
import { parseArgv } from "./parse.js";
import { routeCommand, routeSpecific } from "./router.js";
import { executePassthrough } from "./executor.js";
import { shouldCompress } from "./shim/gate.js";
import { runShim } from "./shim/cli.js";
import { runInit } from "./shim/init.js";
import { runHook } from "./hook/cli.js";
import { runInspect } from "./inspect/cli.js";
import { runOptimize } from "./context/optimizeCli.js";
import { runAgentsmd } from "./context/agentsmd.js";
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
import { VERSION } from "./version.js";
import type { CommandHandler, FilteredResult, ParsedCommand, RawResult, TkOptions } from "./types.js";

function help(): string {
  return [
    "Usage: tk [tk flags] <command...>",
    "       tk shim <install|uninstall|status>",
    "       tk init [--host auto|copilot-cli|vscode] [--project] [--show] [--dry-run] [--uninstall]",
    "       tk hook <copilot|check <command>>",
    "       tk inspect [--json] [--since 7d] [--session <id>] [--input-type vscode|copilot-cli] [--repo-context]",
    "                  [--advice] [--write-advice] [--telemetry-export] [--min-confidence n] [--min-occurrences n]",
    "                  [--project] [--user] [--copilot-context] [--surface instructions|prompts|agents|skills] [--fail-on info|warn|error]",
    "       tk optimize context [--dry-run] [--write-advice] [--apply-safe] [--token-budget-block] [--surface <name>] [--project|--user]",
    "       tk agentsmd <patch|restore>",
    "       tk gain [--user] [--daily|--weekly|--monthly|--all] [--graph] [--history [n]]",
    "               [--failures] [--quota [-t <model>]] [--json|--csv|--format json|csv|text]",
    "       tk config <init|show|path>",
    "       tk report [--scope user|project|runtime] [--project|--user] [--since <date>] [--json]",
    "       tk telemetry <enable|disable|status|preview|purge>",
    "",
    "Flags:",
    "  --raw                 print raw stdout/stderr",
    "  --stats               print token savings",
    "  --verbose             print token savings and raw output path",
    "  --max-lines <n>       limit compressed output lines",
    "  --max-chars <n>       limit compressed output chars",
    "  --save-raw            always save raw output",
    "  --no-save-raw         never save raw output",
    "  --report [--json|--csv]",
    "  --help",
    "  --version",
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
  if (parsed.mode === "report-ledger") {
    return runReport(parsed.subArgs ?? []);
  }
  if (parsed.mode === "shim") {
    return runShim(parsed.subArgs ?? []);
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
  if (parsed.mode === "agentsmd") {
    return runAgentsmd(parsed.subArgs ?? []);
  }
  if (parsed.mode === "gain") {
    return runGain(parsed.subArgs ?? [], parsed.options.cwd);
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
