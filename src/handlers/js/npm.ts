import type { ParsedCommand, RawResult, TkOptions } from "../../types.js";
import { defineHandler } from "../define.js";

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

// H14: ERESOLVE peer-dep warnings carry actionable package conflict info — keep them.
// Other generic npm WARN lines (deprecated packages, peer notices) are still stripped.
function isEresolveWarn(line: string): boolean {
  const trimmed = line.trimStart();
  return (
    trimmed.startsWith("npm WARN") &&
    (trimmed.includes("ERESOLVE") ||
      trimmed.includes("peer dep") ||
      trimmed.includes("Could not resolve") ||
      trimmed.includes("conflicting peer"))
  );
}

// RTK: js/npm_cmd.rs::filter_npm_output — strip boilerplate, progress bars, npm WARN.
function filterNpmOutput(output: string): string {
  const result: string[] = [];

  for (const line of output.split(/\r?\n/)) {
    // Skip npm lifecycle banner: "> project@1.0.0 build"
    if (line.startsWith(">") && line.includes("@")) {
      continue;
    }
    // H14: keep ERESOLVE / peer-dep conflict warnings (actionable); strip others.
    if (line.trimStart().startsWith("npm WARN")) {
      if (isEresolveWarn(line)) {
        result.push(line.trimStart());
      }
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

export const npmHandler = defineHandler({
  name: "npm",

  match: matchesNpm,

  format: (raw, _command, options: TkOptions) => {
    return formatNpm(raw);
  },
});
