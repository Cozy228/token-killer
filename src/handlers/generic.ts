import { executeCommand } from "../executor.js";
import type { CommandHandler } from "../types.js";
import { IMPORTANT_PATTERN } from "../core/patterns.js";
import { makeFilteredResult, rawText } from "./base.js";

function genericCompress(text: string): string {
  if (text.length < 2000) return text;

  const lines = text.split(/\r?\n/);
  const head = lines.slice(0, 30);
  const important = lines.filter((line) => IMPORTANT_PATTERN.test(line)).slice(0, 80);
  const tail = lines.slice(-30);
  return [...head, ...important, `... ${Math.max(0, lines.length - 60)} lines hidden ...`, ...tail].join(
    "\n",
  );
}

export const genericHandler: CommandHandler = {
  name: "generic",

  matches() {
    return true;
  },

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, genericCompress(rawText(raw)), options);
  },
};
