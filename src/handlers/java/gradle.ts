import type { OmissionDeclaration } from "../../types.js";
import { removeAnsi } from "../../core/ansi.js";
import { overBudgetLadder } from "../common/budget.js";
import { defineHandler } from "../define.js";
import { parseJavaEcosystemOutput } from "./staticAnalysis.js";

type GradleTask =
  | "build"
  | "test"
  | "check"
  | "connected"
  | "lint"
  | "dependencies"
  | "analysis"
  | "passthrough";

const GRADLE_VERBOSE_FLAGS = new Set(["--stacktrace", "--full-stacktrace", "--info", "--debug"]);
const GRADLE_OPTION_VALUE_FLAGS = new Set([
  "--configuration",
  "--tests",
  "--project-dir",
  "--build-file",
  "--settings-file",
  "--init-script",
  "--include-build",
  "-p",
  "-b",
  "-c",
  "-I",
]);

function isGradleVerbose(args: string[]): boolean {
  return args.some((arg) => GRADLE_VERBOSE_FLAGS.has(arg));
}

function taskName(arg: string): string {
  const parts = arg.split(":").filter(Boolean);
  return parts[parts.length - 1] ?? arg;
}

function classifyGradleTask(arg: string): Exclude<GradleTask, "passthrough"> | undefined {
  const name = taskName(arg);
  const lower = name.toLowerCase();

  if (lower.includes("connected") && lower.includes("androidtest")) return "connected";
  if (lower === "dependencies") return "dependencies";
  if (lower === "check") return "check";
  if (
    lower.startsWith("checkstyle") ||
    lower.startsWith("pmd") ||
    lower.startsWith("spotbugs") ||
    lower === "jacocotestcoverageverification"
  ) {
    return "analysis";
  }
  if (lower.startsWith("lint")) return "lint";
  if (lower.includes("test")) return "test";
  if (
    lower === "build" ||
    lower.startsWith("assemble") ||
    lower.startsWith("bundle") ||
    lower.startsWith("install")
  ) {
    return "build";
  }

  return undefined;
}

function detectGradleTask(args: string[]): GradleTask {
  let detected: GradleTask | undefined;
  let sawConnected = false;
  let skipNext = false;

  for (const arg of args) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (GRADLE_OPTION_VALUE_FLAGS.has(arg)) {
      skipNext = true;
      continue;
    }
    if (arg.startsWith("-")) continue;

    const name = taskName(arg);
    if (name === "clean") continue;

    const family = classifyGradleTask(arg);
    if (family === "connected") sawConnected = true;
    detected = family ?? "passthrough";
  }

  return sawConnected ? "connected" : (detected ?? "passthrough");
}

function isFrameworkFrame(line: string): boolean {
  return /^\s*at (?:org\.junit\.|org\.gradle\.|java\.base\/|jdk\.internal\.)/.test(line);
}

function isGradleHelpNoise(line: string): boolean {
  return (
    line.startsWith("Starting a Gradle Daemon") ||
    line.startsWith("Daemon will be stopped") ||
    line.startsWith("> Configure project ") ||
    line.startsWith("* Try:") ||
    line.startsWith("> Run with ") ||
    line.startsWith("* Get more help") ||
    /^> Task .*(?:UP-TO-DATE|NO-SOURCE)$/.test(line) ||
    line.startsWith("INSTRUMENTATION_") ||
    /^Starting \d+ tests/.test(line) ||
    line.endsWith(" PASSED") ||
    isFrameworkFrame(line)
  );
}

function collectGradleBuildLines(lines: string[]): string[] {
  return lines.filter(
    (line) =>
      !isGradleHelpNoise(line) &&
      (/^> Task .*FAILED/.test(line) ||
        line.startsWith("FAILURE:") ||
        line.startsWith("Execution failed ") ||
        /^> (?:A failure occurred|Compilation error)/.test(line) ||
        line.startsWith("e: ") ||
        line.startsWith("w: ") ||
        line.startsWith("warning: ") ||
        line.startsWith("Warning: ") ||
        /\.(?:java|kt):/.test(line) ||
        line.startsWith("Caused by:") ||
        /^BUILD (?:FAILED|SUCCESSFUL)/.test(line) ||
        /actionable tasks:/.test(line) ||
        /https?:\/\/.*gradle.*scan/i.test(line)),
  );
}

function collectGradleTestLines(lines: string[]): string[] {
  return lines.filter(
    (line) =>
      !isGradleHelpNoise(line) &&
      (line.endsWith("FAILED") ||
        /(?:AssertionError|Exception|Error):/.test(line) ||
        /^\s*at /.test(line) ||
        /tests completed, \d+ failed/.test(line) ||
        line.startsWith("There were failing tests") ||
        /See the report at:/.test(line) ||
        /file:\/\//.test(line) ||
        /^BUILD (?:FAILED|SUCCESSFUL)/.test(line) ||
        /actionable tasks:/.test(line)),
  );
}

function collectGradleConnectedLines(lines: string[]): string[] {
  return lines.filter(
    (line) =>
      !isGradleHelpNoise(line) &&
      (line.endsWith("FAILED") ||
        /No connected devices|INSTALL_FAILED|FAILURES!!!/.test(line) ||
        line.startsWith("Tests run:") ||
        /(?:AssertionError|Exception|Error):/.test(line) ||
        /^\s*at /.test(line) ||
        /^BUILD (?:FAILED|SUCCESSFUL)/.test(line) ||
        /actionable tasks:/.test(line)),
  );
}

function collectGradleLintLines(lines: string[]): string[] {
  return lines.filter(
    (line) =>
      !isGradleHelpNoise(line) &&
      (/Ran lint on variant/.test(line) ||
        /Wrote .* report to file:\/\//.test(line) ||
        /StringFormatInvalid|HardcodedText|ContentDescription/.test(line) ||
        /errors?, \d+ warnings/.test(line) ||
        /^\s*\^$/.test(line) ||
        /String\.format|getString|<ImageView|return ".*"/.test(line) ||
        /^BUILD (?:FAILED|SUCCESSFUL)/.test(line) ||
        /actionable tasks:/.test(line)),
  );
}

function collectGradleDependencyLines(lines: string[]): string[] {
  return lines
    .filter((line) => {
      if (isGradleHelpNoise(line) || line.startsWith("> Task ")) return false;
      return (
        /^[A-Za-z][\w.-]*\s+-\s+/.test(line) ||
        /^(?:\+---|\\---) /.test(line) ||
        /^BUILD (?:FAILED|SUCCESSFUL)/.test(line)
      );
    })
    .map((line) => line.replace(/^(?:\+---|\\---) /, "").trim());
}

function collectGradleAnalysisLines(lines: string[]): string[] {
  return lines.filter(
    (line) =>
      !isGradleHelpNoise(line) &&
      (/^BUILD (?:FAILED|SUCCESSFUL)/.test(line) || /actionable tasks:/.test(line)),
  );
}

function collectGradleLines(text: string, task: GradleTask): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() !== "");

  const important =
    task === "test"
      ? collectGradleTestLines(lines)
      : task === "check"
        ? [...collectGradleTestLines(lines), ...collectGradleAnalysisLines(lines)]
        : task === "connected"
          ? collectGradleConnectedLines(lines)
          : task === "lint"
            ? collectGradleLintLines(lines)
            : task === "dependencies"
              ? collectGradleDependencyLines(lines)
              : task === "analysis"
                ? collectGradleAnalysisLines(lines)
                : collectGradleBuildLines(lines);

  return [...new Set([...important.map((line) => line.trim()), ...parseJavaEcosystemOutput(text)])];
}

function formatGradle(
  text: string,
  task: GradleTask,
): string | { output: string; omission?: OmissionDeclaration } {
  if (task === "passthrough") {
    return text;
  }

  const important = collectGradleLines(text, task);
  if (important.length === 0) {
    return text;
  }

  // Note: heading is intentionally conditional on BUILD SUCCESSFUL (not "failed" always).
  const heading = /BUILD SUCCESSFUL/.test(text) ? "Gradle" : "Gradle failed";

  const render = (items: string[]): string => `${[heading, ...items].join("\n")}\n`;

  const full = render(important);

  // ADR 0001 over-budget ladder: declared cap, never a silent slice.
  const ladder = overBudgetLadder({
    full,
    digest: important.length > 0 ? () => render(important.slice(0, 40)) : undefined,
    replacement: () => {
      return `${heading}: ${important.length} retained line(s) (over budget)\n`;
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

  format: (raw, command, _options) => {
    const text = removeAnsi(`${raw.stdout}\n${raw.stderr}`);
    if (isGradleVerbose(command.args)) return text;
    return formatGradle(text, detectGradleTask(command.args));
  },
});
