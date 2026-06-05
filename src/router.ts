import type { CommandHandler, ParsedCommand } from "./types.js";
import { handlers } from "./handlers/index.js";
import { genericHandler } from "./handlers/generic.js";

// The full router: always returns a handler, falling back to genericHandler
// whose matches() is always true. Used by the --raw / report paths that compress
// (or pass through) every command regardless of whether a real handler matched.
export function routeCommand(command: ParsedCommand): CommandHandler {
  return handlers.find((handler) => handler.matches(command)) ?? handlers[handlers.length - 1]!;
}

// The shim's specific-match signal: return the first handler that matches the
// command EXCLUDING the generic fall-through, else null. The shim gate uses this
// to decide compress-vs-passthrough — only a specific match is eligible for
// compression; a generic fall-through is a passthrough candidate (ADR 0002 §2,
// CONTEXT.md → Specific match).
export function routeSpecific(command: ParsedCommand): CommandHandler | null {
  for (const handler of handlers) {
    if (handler === genericHandler) continue;
    if (handler.matches(command)) return handler;
  }
  return null;
}
