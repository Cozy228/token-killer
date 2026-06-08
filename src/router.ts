import type { CommandHandler, ParsedCommand } from "./types.js";
import { handlers } from "./handlers/index.js";
import { genericHandler } from "./handlers/generic.js";

// The full router: always returns a handler, falling back to genericHandler
// whose matches() is always true. Used by the --raw / report paths that compress
// (or pass through) every command regardless of whether a real handler matched.
export function routeCommand(command: ParsedCommand): CommandHandler {
  return handlers.find((handler) => handler.matches(command)) ?? handlers[handlers.length - 1]!;
}

// A pure `--version` / `--help` probe carries no compressible payload — the output
// is a version string or prose help. Handlers that match on the program name alone
// (eslint, vitest, jest, …) otherwise hijack it: `eslint --version` was rewritten to
// the nonsensical "ESLint: 0 problems in 0 files", which the inflation gate then
// caught and REVERTED, logging a false `inflated` row and polluting `tk gain`. Skip
// straight to passthrough. Only LONG-form flags are matched — short `-v`/`-h` are
// overloaded (grep -v invert, ls -h human-readable) and must never be treated as
// probes. `-version`/`-help` (single dash) are the JVM spelling (`javac -version`).
const PROBE_FLAGS = new Set(["--version", "--help", "-version", "-help"]);
function isProbeCommand(command: ParsedCommand): boolean {
  return command.args.length > 0 && command.args.every((arg) => PROBE_FLAGS.has(arg));
}

// The shim's specific-match signal: return the first handler that matches the
// command EXCLUDING the generic fall-through, else null. The shim gate uses this
// to decide compress-vs-passthrough — only a specific match is eligible for
// compression; a generic fall-through is a passthrough candidate (ADR 0002 §2,
// CONTEXT.md → Specific match).
export function routeSpecific(command: ParsedCommand): CommandHandler | null {
  if (isProbeCommand(command)) return null;
  for (const handler of handlers) {
    if (handler === genericHandler) continue;
    if (handler.matches(command)) return handler;
  }
  return null;
}
