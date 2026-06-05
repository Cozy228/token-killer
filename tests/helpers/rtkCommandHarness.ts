import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "vitest";
import { routeCommand } from "../../src/router.js";
import type { FilteredResult, ParsedCommand, RawResult, TkOptions } from "../../src/types.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const options: TkOptions = {
  raw: false,
  stats: false,
  verbose: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: repoRoot,
};

function parsed(command: string[]): ParsedCommand {
  return {
    program: command[0] ?? "",
    args: command.slice(1),
    original: command,
    displayCommand: command.join(" "),
  };
}

function raw(command: string[], stdout: string, exitCode = 0, stderr = ""): RawResult {
  return {
    command: command.join(" "),
    stdout,
    stderr,
    exitCode,
    durationMs: 1,
  };
}

export async function filterRtkFixture(
  commandArgs: string[],
  fixturePath: string,
  exitCode = 0,
) {
  const stdout = await readFile(path.join(repoRoot, fixturePath), "utf8");
  return filterRtkOutput(commandArgs, stdout, exitCode);
}

export async function filterRtkOutput(
  commandArgs: string[],
  stdout: string,
  exitCode = 0,
  stderr = "",
) {
  const command = parsed(commandArgs);
  const handler = routeCommand(command);
  const rawResult = raw(commandArgs, stdout, exitCode, stderr);
  const result = await handler.filter(rawResult, command, options);
  assertNotUnfilteredPassthrough(commandArgs, stdout, result.output);
  return { ...result, rawOutput: stdout };
}

function assertNotUnfilteredPassthrough(
  commandArgs: string[],
  stdout: string,
  output: string,
) {
  if (allowsRtkPassthrough(commandArgs, stdout)) {
    return;
  }

  expect(
    output.trim(),
    `${commandArgs.join(" ")} must not pass RTK behavior tests by returning raw output unchanged`,
  ).not.toBe(stdout.trim());
}

function allowsRtkPassthrough(commandArgs: string[], stdout: string): boolean {
  const [program, ...args] = commandArgs;
  const trimmed = stdout.trim();

  if (program === "curl") {
    // RTK: cloud/curl_cmd.rs::filter_curl_output passes through unchanged when the
    // body looks like top-level JSON OR is under MAX_RESPONSE_SIZE (500 bytes).
    // Both are genuine RTK retention paths, not unfiltered-passthrough cheats.
    const looksJson =
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'));
    return looksJson || Buffer.byteLength(trimmed, "utf8") < 500;
  }

  if (program === "grep" || program === "rg") {
    // `--level none` is an explicit opt-out (= --raw): verbatim passthrough.
    const levelNone = args.some(
      (arg, i) => (arg === "--level" && args[i + 1] === "none") || arg === "--level=none",
    );
    if (levelNone) return true;
    // Format flags (-c/-l/-L/-o/-Z/--json) and context flags (-A/-B/-C and long
    // forms) are genuine RTK retention paths: tk passes them through verbatim.
    return args.some(
      (arg) =>
        [
          "-c",
          "--count",
          "-l",
          "--files-with-matches",
          "-L",
          "--files-without-match",
          "-o",
          "--only-matching",
          "-Z",
          "--null",
          "--json",
          "-A",
          "-B",
          "-C",
          "--after-context",
          "--before-context",
          "--context",
        ].includes(arg) ||
        /^-[ABC]\d+$/.test(arg) ||
        /^--(after-context|before-context|context)=/.test(arg),
    );
  }

  return program === "rustc" && args.includes("--version");
}

export type RtkParityResult = FilteredResult & {
  rawOutput: string;
};

export type RtkParityExpectation = {
  critical: string[];
  forbidden?: RegExp[];
  maxOutputChars?: number;
  minSavingsRatio?: number;
  // RTK measures savings in whitespace-delimited tokens (count_tokens =
  // s.split_whitespace().count()), e.g. gradlew_cmd.rs::test_build_token_savings
  // asserts >= 70%. Use this to mirror an explicit RTK *_token_savings invariant.
  minTokenSavingsRatio?: number;
  exact?: string;
};

// RTK: count_tokens(text) = text.split_whitespace().count() (see
// rtk/.claude/rules/cli-testing.md and gradlew_cmd.rs token-savings tests).
function countTokens(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

export function expectRtkParity(
  result: RtkParityResult,
  expectation: RtkParityExpectation,
) {
  for (const expected of expectation.critical) {
    expect(result.output).toContain(expected);
  }

  for (const pattern of expectation.forbidden ?? []) {
    expect(result.output).not.toMatch(pattern);
  }

  if (expectation.exact !== undefined) {
    expect(result.output.trim()).toBe(expectation.exact.trim());
  }

  if (expectation.maxOutputChars !== undefined) {
    expect(result.output.trim().length).toBeLessThanOrEqual(expectation.maxOutputChars);
  }

  if (expectation.minSavingsRatio !== undefined) {
    const rawChars = result.rawOutput.length;
    const savingsRatio = rawChars === 0 ? 0 : 1 - result.output.length / rawChars;
    expect(savingsRatio + Number.EPSILON).toBeGreaterThanOrEqual(expectation.minSavingsRatio);
  }

  if (expectation.minTokenSavingsRatio !== undefined) {
    const rawTokens = countTokens(result.rawOutput);
    const outTokens = countTokens(result.output);
    const tokenSavings = rawTokens === 0 ? 0 : 1 - outTokens / rawTokens;
    expect(
      tokenSavings + Number.EPSILON,
      `token savings ${(tokenSavings * 100).toFixed(1)}% (${outTokens}/${rawTokens} tokens) below required ${(expectation.minTokenSavingsRatio * 100).toFixed(1)}%`,
    ).toBeGreaterThanOrEqual(expectation.minTokenSavingsRatio);
  }
}
