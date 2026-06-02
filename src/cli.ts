#!/usr/bin/env node
import { parseArgv } from "./parse.js";
import { routeCommand } from "./router.js";
import { buildReport } from "./core/report.js";
import { runPipeline } from "./core/pipeline.js";
import { recordHistory } from "./core/history.js";
import { calculateSavings } from "./core/savings.js";
import { maybeSaveRawOutput } from "./core/rawStore.js";
import { formatStats } from "./core/stats.js";
import type { FilteredResult, RawResult, TgOptions } from "./types.js";

const VERSION = "0.1.0";

function help(): string {
  return [
    "Usage: tg [tg flags] <command...>",
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
  if (!parsed.command) {
    process.stderr.write("tg: missing command\n");
    return 1;
  }

  const handler = routeCommand(parsed.command);
  const raw = await handler.execute(parsed.command, parsed.options);

  if (parsed.options.raw) {
    process.stdout.write(raw.stdout);
    process.stderr.write(raw.stderr);
    await recordRawPassthrough(raw, parsed.options);
    return raw.exitCode;
  }

  const filtered = await runPipeline(
    {
      ...handler,
      async execute() {
        return raw;
      },
    },
    parsed.command,
    parsed.options,
  ).then((result) => result.filtered);

  process.stdout.write(filtered.output);
  if (filtered.output.length > 0 && !filtered.output.endsWith("\n")) {
    process.stdout.write("\n");
  }

  if (parsed.options.stats || parsed.options.verbose) {
    process.stdout.write(`\n${formatStats(filtered)}\n`);
  }
  return raw.exitCode;
}

try {
  process.exitCode = await main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
