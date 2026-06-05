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
import { runPipeline } from "./core/pipeline.js";
import { recordHistory } from "./core/history.js";
import { calculateSavings } from "./core/savings.js";
import { maybeSaveRawOutput } from "./core/rawStore.js";
import { formatStats } from "./core/stats.js";
import { VERSION } from "./version.js";
import type { CommandHandler, FilteredResult, ParsedCommand, RawResult, TgOptions } from "./types.js";

function help(): string {
  return [
    "Usage: tg [tg flags] <command...>",
    "       tg shim <install|uninstall|status>",
    "       tg init [--host auto|copilot-cli|vscode] [--project] [--show] [--dry-run] [--uninstall]",
    "       tg hook <copilot|check <command>>",
    "       tg inspect [--json] [--since 7d] [--session <id>] [--input-type vscode|copilot-cli] [--repo-context]",
    "                  [--advice] [--write-advice] [--telemetry-export] [--min-confidence n] [--min-occurrences n]",
    "                  [--project] [--user] [--copilot-context] [--surface instructions|prompts|agents|skills] [--fail-on info|warn|error]",
    "       tg optimize context [--dry-run] [--write-advice] [--apply-safe] [--token-budget-block] [--surface <name>] [--project|--user]",
    "       tg agentsmd <patch|restore>",
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

async function recordRawPassthrough(raw: RawResult, options: TgOptions): Promise<void> {
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
  if (!parsed.command) {
    process.stderr.write("tg: missing command\n");
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
    return await failOpenPassthrough(command, error);
  }
}

async function runCompress(
  handler: CommandHandler,
  command: ParsedCommand,
  options: TgOptions,
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
