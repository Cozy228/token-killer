import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";

function formatGradle(text: string): string {
  const important = text
    .split(/\r?\n/)
    .filter((line) =>
      /FAILED|Assertion|expected|BUILD FAILED|BUILD SUCCESSFUL|tests completed|Tests run:|actionable tasks|See the report at|file:\/\/|StringFormatInvalid|ContentDescription|errors?, \d+ warnings|^\s*\^$|String\.format|getString|<ImageView|^e: |^w: |^warning: |^Warning: |\.java:\d+|\.kt:/.test(
        line,
      ),
    )
    .filter((line) => !/Run with --stacktrace|Get more help|INSTRUMENTATION_STATUS|Starting \d+ tests| PASSED|org\.junit\.Assert/.test(line))
    .slice(0, 80)
    .map((line) => line.trim());

  const heading = /BUILD SUCCESSFUL/.test(text) ? "Gradle" : "Gradle failed";
  return `${[heading, ...important].join("\n")}\n`;
}

export const gradleHandler: CommandHandler = {
  name: "gradle",
  programs: ["gradle"],

  matches(command) {
    return (
      command.program === "gradle" ||
      command.program === "./gradlew" ||
      command.program === "gradlew" ||
      command.program.endsWith("gradlew.bat")
    );
  },

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatGradle(`${raw.stdout}\n${raw.stderr}`), options);
  },
};
