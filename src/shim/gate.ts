import { routeSpecific } from "../router.js";
import type { CommandHandler, ParsedCommand } from "../types.js";
import { isInteractive } from "./interactive.js";

// The shim compress-vs-passthrough gate (ADR 0002 §2-3, CONTEXT.md → Delivery).
// Compress IFF the command is a specific match (a real handler, not the generic
// fall-through) AND stdout is NOT a TTY (it was piped to the agent, no human
// watching) AND the command is not on the interactive denylist. Otherwise the
// caller passes through to the real tool. `isTTY` is injected so the decision is
// a pure, testable function (cli.ts passes Boolean(process.stdout.isTTY)).
//
// `match` lets a caller that already resolved routeSpecific(command) pass it in
// to avoid routing twice (review finding F5); it defaults to resolving here so
// the function stays a self-contained, pure unit.
export function shouldCompress(
  command: ParsedCommand,
  isTTY: boolean,
  match: CommandHandler | null = routeSpecific(command),
): boolean {
  return match !== null && !isTTY && !isInteractive(command);
}
