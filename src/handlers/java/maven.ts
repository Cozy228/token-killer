import type { OmissionDeclaration, ParsedCommand } from "../../types.js";
import { removeAnsi } from "../../core/ansi.js";
import { overBudgetLadder } from "../common/budget.js";
import { defineHandler } from "../define.js";
import { parseJavaEcosystemOutput } from "./staticAnalysis.js";

type MavenPhase =
  | "compile"
  | "test-compile"
  | "test"
  | "integration-test"
  | "package"
  | "install"
  | "verify"
  | "deploy";

const MAVEN_PHASES = new Set<MavenPhase>([
  "compile",
  "test-compile",
  "test",
  "integration-test",
  "package",
  "install",
  "verify",
  "deploy",
]);

const MAVEN_PROBE_FLAGS = new Set(["--version", "-v", "-version", "--help", "-help"]);
const MAVEN_VERBOSE_FLAGS = new Set(["-X", "--debug", "-e", "--errors"]);
const MAVEN_OPTION_VALUE_FLAGS = new Set([
  "-f",
  "--file",
  "-pl",
  "--projects",
  "-rf",
  "--resume-from",
]);
const MAVEN_IN_SCOPE_PLUGIN_GOALS = /^(?:checkstyle|pmd|spotbugs|jacoco|spring-boot):/;

function isMavenQuiet(args: string[]): boolean {
  return args.some((arg) => arg === "-q" || arg === "--quiet");
}

function isMavenProbe(args: string[]): boolean {
  return args.length > 0 && args.every((arg) => MAVEN_PROBE_FLAGS.has(arg));
}

function isMavenVerbose(args: string[]): boolean {
  return args.some((arg) => MAVEN_VERBOSE_FLAGS.has(arg));
}

function detectMavenPhase(args: string[]): MavenPhase | "passthrough" {
  let phase: MavenPhase | undefined;
  let skipNext = false;

  for (const arg of args) {
    if (skipNext) {
      skipNext = false;
      continue;
    }
    if (MAVEN_OPTION_VALUE_FLAGS.has(arg)) {
      skipNext = true;
      continue;
    }
    if (arg.startsWith("-")) continue;
    if (arg.includes(":")) {
      if (MAVEN_IN_SCOPE_PLUGIN_GOALS.test(arg)) phase = "verify";
      else return "passthrough";
    }
    if (MAVEN_PHASES.has(arg as MavenPhase)) phase = arg as MavenPhase;
  }

  return phase ?? "passthrough";
}

function stripMavenPrefix(line: string): string {
  return line.replace(/^\[(?:INFO|ERROR|WARNING)\]\s?/, "").trim();
}

function hasEnglishFooter(text: string): boolean {
  return /\bBUILD (?:SUCCESS|FAILURE)\b/.test(text);
}

function hasQuietFailureSignal(text: string): boolean {
  return /\[ERROR\]|<<< (?:FAILURE|ERROR)!|Tests run:/.test(text);
}

function isFrameworkFrame(line: string): boolean {
  return /^at (?:org\.junit\.|org\.apache\.maven\.|org\.springframework\.|java\.base\/|jdk\.internal\.|sun\.reflect\.)/.test(
    line,
  );
}

function isMavenNoise(line: string): boolean {
  return (
    line === "" ||
    line.startsWith('Scanning for projects') ||
    /^--- .+ ---$/.test(line) ||
    /^Running [\w.$-]+/.test(line) ||
    /^Results:$/.test(line) ||
    line.startsWith('Total time:') ||
    line.startsWith('Finished at:') ||
    line.startsWith('Downloading from ') ||
    line.startsWith('Downloaded from ') ||
    line.startsWith('Re-run Maven using ') ||
    line.startsWith('To see the full stack trace') ||
    line.startsWith('For more information')
  );
}

function isPerClassPassingSummary(line: string): boolean {
  return line.startsWith('Tests run:') && / -- in /.test(line) && !/<<< (?:FAILURE|ERROR)!/.test(line);
}

function isFailureSummaryLine(line: string): boolean {
  return /^[\w.$-]+(?:Test|Tests)\.[\w$.-]+:\d+\b/.test(line);
}

function isCompileDiagnostic(line: string): boolean {
  return /\.java:\[\d+,\d+\]/.test(line) || /^(?:symbol|location|required|found):/.test(line);
}

function isWarningDiagnostic(line: string): boolean {
  return /(?:^|\b)warning\b/i.test(line) || /\[WARNING\]/.test(line);
}

function collectMavenLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const important: string[] = [];
  const warningMessages = new Set<string>();

  for (const rawLine of lines) {
    const line = stripMavenPrefix(rawLine);
    if (isMavenNoise(line) || isPerClassPassingSummary(line)) continue;

    if (isFrameworkFrame(line)) continue;

    if (isWarningDiagnostic(line)) {
      const key = line.replace(/^.*?\.java:\[\d+,\d+\]\s*/, "").trim();
      if (warningMessages.has(key)) continue;
      warningMessages.add(key);
    }

    if (
      /\bBUILD (?:SUCCESS|FAILURE)\b/.test(line) ||
      /\bReactor Summary\b/.test(line) ||
      /\s+\.+\s+(?:SUCCESS|FAILURE|SKIPPED)\b/.test(line) ||
      line.startsWith('Tests run:') ||
      /^Failures:$/.test(line) ||
      /^Errors:$/.test(line) ||
      /<<< (?:FAILURE|ERROR)!/.test(line) ||
      /^(?:[\w.$-]+(?:Exception|Error)|java\.[\w.$-]+):/.test(line) ||
      line.startsWith('Caused by:') ||
      line.startsWith('at ') ||
      isFailureSummaryLine(line) ||
      isCompileDiagnostic(line) ||
      line.startsWith('There are test failures.') ||
      /^Please refer to .*surefire-reports/.test(line) ||
      line.startsWith('Failed to execute goal ')
    ) {
      important.push(line.replace(/\s+\([^)]+\)(?= on project)/g, ""));
    }
  }

  return [...new Set([...important, ...parseJavaEcosystemOutput(text)])];
}

function formatMaven(
  text: string,
  command: ParsedCommand,
): string | { output: string; omission?: OmissionDeclaration } {
  if (isMavenVerbose(command.args) || isMavenProbe(command.args)) {
    return text;
  }

  const phase = detectMavenPhase(command.args);
  if (phase === "passthrough") {
    return text;
  }

  const quiet = isMavenQuiet(command.args);
  if (!hasEnglishFooter(text) && !(quiet && hasQuietFailureSignal(text))) {
    return text;
  }

  const important = collectMavenLines(text);
  if (important.length === 0) {
    return text;
  }

  // Derive heading from actual result — successful builds must not be labeled failed.
  const isSuccess = /BUILD SUCCESS/.test(text);
  const heading = isSuccess ? "Maven" : "Maven failed";

  const render = (items: string[]): string => {
    const out = [heading];
    out.push(...items.map((line) => line.trim()));
    return `${[...new Set(out)].join("\n")}\n`;
  };

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

export const mavenHandler = defineHandler({
  name: "maven",
  traits: { structural: true },
  programs: ["mvn"],

  match(command) {
    return command.program === "mvn" || command.program.endsWith("mvn.cmd");
  },

  format: (raw, command, _options) =>
    formatMaven(removeAnsi(`${raw.stdout}\n${raw.stderr}`), command),
});
