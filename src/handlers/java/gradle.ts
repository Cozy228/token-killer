import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";

function formatGradle(text: string): string {
  const important = text
    .split(/\r?\n/)
    .filter((line) => /FAILED|Assertion|expected|BUILD FAILED|tests completed|\.java:\d+/.test(line))
    .filter((line) => !/compileNoise/.test(line))
    .slice(0, 80)
    .map((line) => line.trim());
  return `${["Gradle failed", ...important].join("\n")}\n`;
}

export const gradleHandler: CommandHandler = {
  name: "gradle",

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
