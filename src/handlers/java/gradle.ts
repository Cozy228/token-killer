import type { OmissionDeclaration } from "../../types.js";
import { overBudgetLadder } from "../common/budget.js";
import { defineHandler } from "../define.js";

function formatGradle(text: string): { output: string; omission?: OmissionDeclaration } {
  const important = text
    .split(/\r?\n/)
    .filter((line) =>
      /FAILED|Assertion|expected|BUILD FAILED|BUILD SUCCESSFUL|tests completed|Tests run:|actionable tasks|See the report at|file:\/\/|StringFormatInvalid|ContentDescription|errors?, \d+ warnings|^\s*\^$|String\.format|getString|<ImageView|^e: |^w: |^warning: |^Warning: |\.java:\d+|\.kt:|Caused by:/.test(
        line,
      ),
    )
    .filter(
      (line) =>
        !/Run with --stacktrace|Get more help|INSTRUMENTATION_STATUS|Starting \d+ tests| PASSED|org\.junit\.Assert/.test(
          line,
        ),
    )
    .map((line) => line.trim());

  // Note: heading is intentionally conditional on BUILD SUCCESSFUL (not "failed" always).
  const heading = /BUILD SUCCESSFUL/.test(text) ? "Gradle" : "Gradle failed";

  const render = (items: string[]): string => `${[heading, ...items].join("\n")}\n`;

  const full = render(important);

  // ADR 0001 over-budget ladder: declared cap, never a silent slice.
  const ladder = overBudgetLadder({
    full,
    digest: important.length > 0 ? () => render(important.slice(0, 40)) : undefined,
    replacement: () => {
      const failCount = important.filter((l) => /FAILED|BUILD FAILED/.test(l)).length;
      return `${heading}: ${failCount} failure line(s) (over budget)\n`;
    },
  });
  return { output: ladder.text, omission: ladder.omission };
}

export const gradleHandler = defineHandler({
  name: "gradle",
  programs: ["gradle"],

  match(command) {
    return (
      command.program === "gradle" ||
      command.program === "./gradlew" ||
      command.program === "gradlew" ||
      command.program.endsWith("gradlew.bat")
    );
  },

  format: (raw, _command, options) => {
    const { output, omission } = formatGradle(`${raw.stdout}\n${raw.stderr}`);
    return { output, omission };
  },
});
