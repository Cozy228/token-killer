import { execFileSync, spawnSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { calculateSavings } from "../src/core/savings.js";
import { routeCommand } from "../src/router.js";
import type { ParsedCommand } from "../src/types.js";
import {
  buildRawArgv,
  buildRtkArgv,
  createDiffFixture,
  createTscErrorFixture,
  diffComparisonCase,
  ghComparisonCase,
  liveComparisonCases,
  skipReason,
  tscErrorComparisonCase,
  type LiveComparisonCase,
} from "./liveComparisonCases.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(repoRoot, "docs/three-way-comparison.md");
const MAX_BUFFER = 20 * 1024 * 1024;

type RowStats = {
  chars: number;
  tokens: number;
  savingsPct: number;
};

export type CaseResult = {
  name: string;
  command: string;
  handler: string;
  rawCmd: string;
  tgCmd: string;
  rtkCmd: string;
  exitCode: number;
  savingsGap: number;
  raw: RowStats;
  tg: RowStats;
  rtk: RowStats;
  rawText: string;
  tgText: string;
  rtkText: string;
};

type SkippedCase = {
  name: string;
  reason: string;
};

function resolveTgBin(): string {
  const built = path.join(repoRoot, "dist/cli.js");
  try {
    accessSync(built, constants.R_OK);
    return built;
  } catch {
    throw new Error("tg binary not found. Run: pnpm build");
  }
}

function toParsed(command: string[]): ParsedCommand {
  return {
    program: command[0] ?? "",
    args: command.slice(1),
    original: command,
    displayCommand: command.join(" "),
  };
}

function runArgv(argv: string[], cwd = repoRoot): { stdout: string; stderr: string; exitCode: number } {
  const env = {
    ...process.env,
    GIT_PAGER: "",
    PAGER: "",
    NO_COLOR: "1",
  };

  const result = spawnSync(argv[0] ?? "", argv.slice(1), {
    cwd,
    encoding: "utf8",
    env,
    maxBuffer: MAX_BUFFER,
  });

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 1,
  };
}

function mergedOutput(result: { stdout: string; stderr: string }): string {
  return `${result.stdout}${result.stderr}`;
}

function statsFromBaseline(rawText: string, outputText: string): { raw: RowStats; filtered: RowStats } {
  const raw = calculateSavings(rawText, rawText);
  const filtered = calculateSavings(rawText, outputText);
  return {
    raw: {
      chars: raw.rawChars,
      tokens: raw.rawTokens,
      savingsPct: 0,
    },
    filtered: {
      chars: filtered.outputChars,
      tokens: filtered.outputTokens,
      savingsPct: filtered.savingsPct,
    },
  };
}

function fenceLength(text: string): number {
  let maxRun = 0;
  for (const match of text.matchAll(/`+/g)) {
    maxRun = Math.max(maxRun, match[0].length);
  }
  return Math.max(3, maxRun + 1);
}

function safeCodeBlock(text: string, info = ""): string {
  const fence = "`".repeat(fenceLength(text));
  const opener = info ? `${fence}${info}` : fence;
  return `${opener}\n${text}\n${fence}`;
}

function displayRtkText(result: CaseResult): string {
  return result.rtkText;
}

function displayTgText(result: CaseResult): string {
  return result.tgText;
}

function savingsGap(result: Pick<CaseResult, "tg" | "rtk">): number {
  return Math.abs(result.tg.savingsPct - result.rtk.savingsPct);
}

function sortBySavingsGap(results: CaseResult[]): CaseResult[] {
  return [...results].sort((left, right) => {
    if (right.savingsGap !== left.savingsGap) {
      return right.savingsGap - left.savingsGap;
    }
    const leftTokenGap = Math.abs(left.tg.tokens - left.rtk.tokens);
    const rightTokenGap = Math.abs(right.tg.tokens - right.rtk.tokens);
    if (rightTokenGap !== leftTokenGap) {
      return rightTokenGap - leftTokenGap;
    }
    return left.name.localeCompare(right.name);
  });
}

function deltaTag(tgPct: number, rtkPct: number): string {
  const diff = tgPct - rtkPct;
  if (Math.abs(diff) < 0.05) return "≈";
  return diff > 0 ? `tg +${diff.toFixed(1)}pp` : `rtk +${Math.abs(diff).toFixed(1)}pp`;
}

function rtkAvailable(): boolean {
  try {
    execFileSync("rtk", ["--version"], { encoding: "utf8", stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function runLiveCase(testCase: LiveComparisonCase, tgBin: string): CaseResult {
  const rawArgv = testCase.rawCommand ?? buildRawArgv(testCase.command);
  const tgArgv = ["node", tgBin, ...testCase.command];
  const rtkArgv = ["rtk", ...(testCase.rtkCommand ?? buildRtkArgv(testCase.command))];
  const handler = routeCommand(toParsed(testCase.command)).name;

  const rawRun = runArgv(rawArgv);
  const tgRun = runArgv(tgArgv);
  const rtkRun = runArgv(rtkArgv);

  const rawText = mergedOutput(rawRun);
  const tgText = mergedOutput(tgRun);
  const rtkText = mergedOutput(rtkRun);
  const { raw, filtered: tg } = statsFromBaseline(rawText, tgText);
  const rtk = statsFromBaseline(rawText, rtkText).filtered;
  const result: CaseResult = {
    name: testCase.name,
    command: testCase.command.join(" "),
    handler,
    rawCmd: rawArgv.join(" "),
    tgCmd: `tg ${testCase.command.join(" ")}`,
    rtkCmd: rtkArgv.slice(1).join(" "),
    exitCode: rawRun.exitCode,
    savingsGap: 0,
    raw,
    tg,
    rtk,
    rawText,
    tgText,
    rtkText,
  };
  result.savingsGap = savingsGap(result);
  return result;
}

export function renderReport(results: CaseResult[], skipped: SkippedCase[], rtkVersion: string): string {
  const generated = new Date().toISOString().slice(0, 10);
  const lines: string[] = [
    "# tg vs rtk — Three-Way Comparison (live repo)",
    "",
    `Generated: ${generated}`,
    `Project: \`token-guard\` (${repoRoot})`,
    `Scope: ${results.length} live commands in repo root (handler-aligned)`,
    `rtk: ${rtkVersion}`,
    "",
    "**Method**",
    "- **raw**: underlying command stdout+stderr (`git --no-pager` for git)",
    "- **tg**: `node dist/cli.js <command>` (same argv as handler routing)",
    "- **rtk**: mapped native `rtk` subcommand (see per-case RTK cmd)",
    "- **savingsPct**: token estimate vs raw (`ceil(chars/4)`), same as tg core",
    "- **Sort**: cases ordered by |tg savingsPct − rtk savingsPct| (largest gap first)",
    "",
    "## Summary",
    "",
    "| # | Case | Handler | raw | tg | rtk | tg savings | rtk savings | Δ |",
    "|---:|---|---|---:|---:|---:|---:|---:|---:|",
  ];

  results.forEach((result, index) => {
    lines.push(
      `| ${index + 1} | ${result.name.replace(/\|/g, "\\|")} | ${result.handler} | ${result.raw.tokens} | ${result.tg.tokens} | ${result.rtk.tokens} | ${result.tg.savingsPct}% | ${result.rtk.savingsPct}% | ${result.savingsGap.toFixed(1)}pp ${deltaTag(result.tg.savingsPct, result.rtk.savingsPct)} |`,
    );
  });

  const totalRaw = results.reduce((sum, row) => sum + row.raw.tokens, 0);
  const totalTg = results.reduce((sum, row) => sum + row.tg.tokens, 0);
  const totalRtk = results.reduce((sum, row) => sum + row.rtk.tokens, 0);
  const tgAggregatePct = totalRaw === 0 ? 0 : Number((((totalRaw - totalTg) / totalRaw) * 100).toFixed(1));
  const rtkAggregatePct = totalRaw === 0 ? 0 : Number((((totalRaw - totalRtk) / totalRaw) * 100).toFixed(1));

  lines.push(
    "",
    "**Aggregate (token-weighted across live cases):**",
    `- raw: ${totalRaw} tokens`,
    `- tg: ${totalTg} tokens (${tgAggregatePct}% savings)`,
    `- rtk: ${totalRtk} tokens (${rtkAggregatePct}% savings)`,
    "",
  );

  if (skipped.length > 0) {
    lines.push("### Skipped cases", "");
    for (const item of skipped) {
      lines.push(`- ${item.name}: ${item.reason}`);
    }
    lines.push("");
  }

  lines.push("---", "", "## Per-case outputs", "");

  results.forEach((result, index) => {
    lines.push(`### ${index + 1}. ${result.name}`);
    lines.push("");
    lines.push(`- Handler: \`${result.handler}\``);
    lines.push(`- tg: \`${result.tgCmd}\``);
    lines.push(`- raw: \`${result.rawCmd}\``);
    lines.push(`- rtk: \`${result.rtkCmd}\``);
    lines.push("");
    lines.push("| channel | chars | tokens | savingsPct |");
    lines.push("|---|---:|---:|---:|");
    lines.push(`| raw | ${result.raw.chars} | ${result.raw.tokens} | 0% |`);
    lines.push(`| tg | ${result.tg.chars} | ${result.tg.tokens} | ${result.tg.savingsPct}% |`);
    lines.push(`| rtk | ${result.rtk.chars} | ${result.rtk.tokens} | ${result.rtk.savingsPct}% |`);
    lines.push("");
    lines.push(`**raw** (${result.raw.chars} chars, ${result.raw.tokens} tokens):`);
    lines.push("");
    lines.push(safeCodeBlock(result.rawText, "text"));
    lines.push("");
    lines.push(
      `**tg** (${result.tg.chars} chars, ${result.tg.tokens} tokens, ${result.tg.savingsPct}% savings):`,
    );
    lines.push("");
    lines.push(safeCodeBlock(displayTgText(result), "text"));
    lines.push("");
    lines.push(
      `**rtk** (${result.rtk.chars} chars, ${result.rtk.tokens} tokens, ${result.rtk.savingsPct}% savings):`,
    );
    lines.push("");
    lines.push(safeCodeBlock(displayRtkText(result), "text"));
    lines.push("");
    lines.push("---");
    lines.push("");
  });

  return lines.join("\n");
}

async function main() {
  if (!rtkAvailable()) {
    throw new Error("rtk not found in PATH");
  }

  const rtkVersion = execFileSync("rtk", ["--version"], { encoding: "utf8" }).trim();
  const tgBin = resolveTgBin();
  const cases: LiveComparisonCase[] = [...liveComparisonCases];

  const diffFixture = createDiffFixture();
  const tscFixture = createTscErrorFixture();
  cases.push(diffComparisonCase(diffFixture.oldPath, diffFixture.newPath));
  cases.push(tscErrorComparisonCase(tscFixture.filePath));

  const ghCase = ghComparisonCase();
  if (ghCase) cases.push(ghCase);

  const results: CaseResult[] = [];
  const skipped: SkippedCase[] = [];

  try {
    for (const testCase of cases) {
      const reason = skipReason(testCase);
      if (reason) {
        skipped.push({ name: testCase.name, reason });
        process.stderr.write(`Skip: ${testCase.name} (${reason})\n`);
        continue;
      }

      process.stderr.write(`Running: ${testCase.name}\n`);
      results.push(runLiveCase(testCase, tgBin));
    }
  } finally {
    diffFixture.cleanup();
    tscFixture.cleanup();
  }

  const report = renderReport(sortBySavingsGap(results), skipped, rtkVersion);
  await writeFile(outputPath, report, "utf8");
  process.stderr.write(`Wrote ${outputPath} (${results.length} cases, ${skipped.length} skipped)\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
