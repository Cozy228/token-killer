import { executeCommand } from "../executor.js";
import type { CommandHandler } from "../types.js";
import { makeFilteredResult, rawText } from "./base.js";

export const genericHandler: CommandHandler = {
  name: "generic",

  matches() {
    return true;
  },

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, rawText(raw), options);
  },
};
