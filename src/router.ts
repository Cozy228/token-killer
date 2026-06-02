import type { CommandHandler, ParsedCommand } from "./types.js";
import { handlers } from "./handlers/index.js";

export function routeCommand(command: ParsedCommand): CommandHandler {
  return handlers.find((handler) => handler.matches(command)) ?? handlers[handlers.length - 1]!;
}
