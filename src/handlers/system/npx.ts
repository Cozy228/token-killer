import { executeCommand } from "../../executor.js";
import { routeCommand } from "../../router.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult, rawText } from "../base.js";

// RTK: main.rs Npx dispatch — `npx <tool> …` re-dispatches to the handler that owns
// <tool> (tsc → TypeScript filter, eslint → lint filter, prisma/next/prettier/
// playwright → their filters), falling back to a raw npm exec for unknown tools.
// tk generalizes this: strip the `npx` prefix, re-route the inner command through
// the normal handler table, and delegate filtering to whichever handler matches.
function innerCommand(command: ParsedCommand): ParsedCommand {
  const inner = command.args;
  return {
    program: inner[0] ?? "",
    args: inner.slice(1),
    original: inner,
    displayCommand: inner.join(" "),
  };
}

export const npxHandler: CommandHandler = {
  name: "npx",
  programs: ["npx"],
  matches(command) {
    // Only re-dispatch when there is an inner tool that is not `npx` itself.
    return command.program === "npx" && command.args.length > 0 && command.args[0] !== "npx";
  },
  execute(command) {
    // Run the real `npx <tool> …`; the inner handler only shapes the output.
    return executeCommand(command);
  },
  async filter(raw, command, options) {
    const inner = innerCommand(command);
    const handler = routeCommand(inner);
    // Guard against routing back to npx (would recurse); fall back to passthrough.
    if (handler.name === "npx") {
      return makeFilteredResult(this, raw, rawText(raw), options);
    }
    return handler.filter(raw, inner, options);
  },
};
