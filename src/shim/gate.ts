import { routeSpecific } from "../router.js";
import type { CommandHandler, ParsedCommand } from "../types.js";
import { isInteractive } from "./interactive.js";

// Why a command did or did not compress — the single most diagnostic event in the
// system (D1). cli.ts traces this so `TK_DEBUG` can answer "why wasn't this
// compressed?" from debug.log alone.
//   - no-handler:  no specific handler matched (a generic fall-through)
//   - interactive: an interactive/pager command — never compress, even in an
//                  opted-in TTY (the guard is UNCONDITIONAL)
//   - tty-no-flag: stdout is a TTY and TK_COMPRESS_TTY is not set
//   - compress:    eligible — compress
export type GateReason = "no-handler" | "interactive" | "tty-no-flag" | "compress";

export type GateDecision = { willCompress: boolean; reason: GateReason };

// The shim compress-vs-passthrough gate (ADR 0002 §2-3, R1, CONTEXT.md → Delivery).
// Compress IFF the command is a specific match (a real handler, not the generic
// fall-through) AND the command is not on the interactive denylist AND stdout is
// NOT a TTY — UNLESS `TK_COMPRESS_TTY` opts this terminal in (R1: VS Code Copilot's
// agent runs in a ConPTY where stdout.isTTY=true even though no human watches, so
// the historical "TTY ⇒ human" premise breaks; the env flag lets such a terminal
// compress). The `!isInteractive` guard stays UNCONDITIONAL — `git rebase -i`,
// pagers, etc. must never be captured even with the flag. `isTTY` is injected so the
// decision is a pure, testable function (cli.ts passes Boolean(process.stdout.isTTY)).
//
// `match` lets a caller that already resolved routeSpecific(command) pass it in
// to avoid routing twice (review finding F5); it defaults to resolving here so
// the function stays a self-contained, pure unit.
export function gateDecision(
  command: ParsedCommand,
  isTTY: boolean,
  match: CommandHandler | null = routeSpecific(command),
): GateDecision {
  if (match === null) return { willCompress: false, reason: "no-handler" };
  if (isInteractive(command)) return { willCompress: false, reason: "interactive" };
  const forceCompress = Boolean(process.env.TK_COMPRESS_TTY);
  if (isTTY && !forceCompress) return { willCompress: false, reason: "tty-no-flag" };
  return { willCompress: true, reason: "compress" };
}

export function shouldCompress(
  command: ParsedCommand,
  isTTY: boolean,
  match: CommandHandler | null = routeSpecific(command),
): boolean {
  return gateDecision(command, isTTY, match).willCompress;
}
