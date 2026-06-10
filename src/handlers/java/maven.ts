import type { OmissionDeclaration, ParsedCommand } from "../../types.js";
import { overBudgetLadder } from "../common/budget.js";
import { defineHandler } from "../define.js";

// Build verbs that produce [ERROR]/FAILURE/Reactor output worth compressing.
// Non-build verbs (dependency:tree, help:*, versions:*, etc.) are passed through
// raw so no output is silently lost.
const BUILD_VERBS = /^(compile|test|package|install|deploy|verify|validate|clean|site|build)$/;

function isBuildVerb(args: string[]): boolean {
  return args.some((arg) => !arg.startsWith("-") && BUILD_VERBS.test(arg));
}

function formatMaven(text: string): { output: string; omission?: OmissionDeclaration } {
  const lines = text.split(/\r?\n/);
  const important = lines
    .filter((line) =>
      /\[ERROR\]|FAILURE|Failures:|Tests run:|Failed to execute goal|Reactor Summary/.test(line),
    )
    .filter((line) => !/Downloading dependency-/.test(line));

  const failedModule = lines.find(
    (line) => /FAILURE/.test(line) && !line.includes("BUILD FAILURE"),
  );

  // Derive heading from actual result — successful builds must not be labeled failed.
  const isSuccess = /BUILD SUCCESS/.test(text);
  const heading = isSuccess ? "Maven" : "Maven failed";

  const render = (items: string[]): string => {
    const out = [heading];
    if (failedModule) out.push(`Failed module: ${failedModule.replace(/\[INFO\]/g, "").trim()}`);
    out.push(...items.map((line) => line.trim()));
    return `${[...new Set(out)].join("\n")}\n`;
  };

  const full = render(important);

  // ADR 0001 over-budget ladder: declared cap, never a silent slice.
  const ladder = overBudgetLadder({
    full,
    digest: important.length > 0 ? () => render(important.slice(0, 40)) : undefined,
    replacement: () => {
      const errorCount = important.filter((l) => /\[ERROR\]/.test(l)).length;
      return `${heading}: ${errorCount} error line(s) (over budget)\n`;
    },
  });
  return { output: ladder.text, omission: ladder.omission };
}

export const mavenHandler = defineHandler({
  name: "maven",
  traits: { structural: true },
  programs: ["mvn"],

  match(command) {
    return command.program === "mvn" || command.program.endsWith("mvn.cmd");
  },

  format: (raw, command, options) => {
    const text = `${raw.stdout}\n${raw.stderr}`;

    // Non-zero exit with zero parse-able structure → return raw (C2 golden rule).
    // Also passthrough non-build verbs (dependency:tree, help:*, versions:*, etc.)
    // so their output is never silently lost.
    if (!isBuildVerb(command.args)) {
      return text;
    }

    const { output, omission } = formatMaven(text);
    return { output, omission };
  },
});
