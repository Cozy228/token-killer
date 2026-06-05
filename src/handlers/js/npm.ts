import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

// RTK: js/npm_cmd.rs — filter `npm`/`npm run` output: strip the lifecycle banner
// (`> pkg@x.y.z script`), `npm WARN` / `npm notice` lines, progress indicators, and
// blank lines. Empty result collapses to "ok".
//
// Routing note: `npm list` / `npm ls` are intentionally left to packageListHandler,
// which renders a richer `[prod]/[dev]` dependency view than RTK's plain
// filter_npm_output. All other npm invocations land here. See FINAL REPORT.

function matchesNpm(command: ParsedCommand): boolean {
  if (command.program !== "npm") return false;
  // Defer `npm list` / `npm ls` to packageListHandler (registered after this one).
  const first = command.args.find((a) => !a.startsWith("-"));
  return first !== "list" && first !== "ls";
}

// RTK: js/npm_cmd.rs::filter_npm_output — strip boilerplate, progress bars, npm WARN.
function filterNpmOutput(output: string): string {
  const result: string[] = [];

  for (const line of output.split(/\r?\n/)) {
    // Skip npm lifecycle banner: "> project@1.0.0 build"
    if (line.startsWith(">") && line.includes("@")) {
      continue;
    }
    // Skip npm WARN lines (after leading whitespace).
    if (line.trimStart().startsWith("npm WARN")) {
      continue;
    }
    // Skip npm notice lines (after leading whitespace).
    if (line.trimStart().startsWith("npm notice")) {
      continue;
    }
    // Skip progress indicators.
    if (
      line.includes("⸩") || // ⸩
      line.includes("⸨") || // ⸨
      (line.includes("...") && line.length < 10)
    ) {
      continue;
    }
    // Skip empty lines.
    if (line.trim() === "") {
      continue;
    }

    result.push(line);
  }

  // RTK: js/npm_cmd.rs::test_filter_npm_output_empty — empty filtered output → "ok".
  return result.length === 0 ? "ok" : result.join("\n");
}

function formatNpm(raw: RawResult): string {
  return `${filterNpmOutput(`${raw.stdout}\n${raw.stderr}`)}\n`;
}

export const npmHandler: CommandHandler = {
  name: "npm",

  matches: matchesNpm,

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options: TgOptions) {
    return makeFilteredResult(this.name, raw, formatNpm(raw), options);
  },
};
