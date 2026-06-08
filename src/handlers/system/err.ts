import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult, rawText } from "../base.js";

// RTK: rust/runner.rs::run_err / ErrorStreamFilter — `err <cmd>` runs a command and
// keeps only error/warning lines plus their indented continuation blocks, dropping
// all surrounding info/progress noise. A block ends on a non-indented, non-error
// line or after two consecutive blank lines. When nothing matched, RTK falls back
// to an "[ok]" line (exit 0) or a "[FAIL]" header + the last 10 raw lines.
const ERROR_PATTERNS: RegExp[] = [
  // Generic errors (case-insensitive, RTK's `(?i)^.*error[\s:\[].*$` etc.)
  /error[\s:[]/i,
  /\berr\b/i,
  /warning[\s:[]/i,
  /\bwarn\b/i,
  /failed/i,
  /failure/i,
  /exception/i,
  /panic/i,
  // Rust specific
  /^error\[E\d+\]:/,
  /^\s*--> .*:\d+:\d+$/,
  // Python
  /^Traceback/,
  /^\s*File ".*", line \d+/,
  // JavaScript/TypeScript
  /^\s*at .*:\d+:\d+/,
  // Go
  /\.go:\d+:/,
];

function isErrorLine(line: string): boolean {
  return ERROR_PATTERNS.some((pattern) => pattern.test(line));
}

// RTK: rust/runner.rs::ErrorStreamFilter::feed_line + on_exit.
function filterErrors(output: string, exitCode: number): string {
  const result: string[] = [];
  let inErrorBlock = false;
  let blankCount = 0;
  let emittedAny = false;

  const lines = output.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

  for (const line of lines) {
    if (isErrorLine(line)) {
      inErrorBlock = true;
      blankCount = 0;
      emittedAny = true;
      result.push(line);
    } else if (inErrorBlock) {
      if (line.trim() === "") {
        blankCount += 1;
        if (blankCount >= 2) {
          inErrorBlock = false;
        } else {
          emittedAny = true;
          result.push(line);
        }
      } else if (line.startsWith(" ") || line.startsWith("\t")) {
        blankCount = 0;
        emittedAny = true;
        result.push(line);
      } else {
        inErrorBlock = false;
      }
    }
  }

  if (!emittedAny) {
    if (exitCode === 0) {
      return "[ok] Command completed successfully (no errors)";
    }
    const tail = lines.slice(Math.max(0, lines.length - 10));
    return [
      `[FAIL] Command failed (exit code: ${exitCode})`,
      ...tail.map((line) => `  ${line}`),
    ].join("\n");
  }

  return result.join("\n");
}

export const errHandler: CommandHandler = {
  name: "err",
  matches(command) {
    return command.program === "err" && command.args.length > 0;
  },
  execute(command) {
    // RTK runs the wrapped command; tk executes args directly (no shell).
    return executeCommand({
      program: command.args[0] ?? "",
      args: command.args.slice(1),
      original: command.args,
      displayCommand: command.args.join(" "),
    });
  },
  async filter(raw, _command, options) {
    return makeFilteredResult(this, raw, filterErrors(rawText(raw), raw.exitCode), options);
  },
};
