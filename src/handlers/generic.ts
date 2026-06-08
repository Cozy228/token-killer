import { rawText } from "./base.js";
import { defineHandler } from "./define.js";

export const genericHandler = defineHandler({
  name: "generic",

  match() {
    return true;
  },

  format: (raw, _command, _options) => rawText(raw),
});
