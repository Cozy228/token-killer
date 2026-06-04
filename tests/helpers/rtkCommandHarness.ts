import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect } from "vitest";
import { routeCommand } from "../../src/router.js";
import type { FilteredResult, ParsedCommand, RawResult, TgOptions } from "../../src/types.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const options: TgOptions = {
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

function raw(command: string[], stdout: string, exitCode = 0): RawResult {
  return {
    command: command.join(" "),
    stdout,
    stderr: "",
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
) {
  const command = parsed(commandArgs);
  const handler = routeCommand(command);
  const rawResult = raw(commandArgs, stdout, exitCode);
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
    return (
      (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith('"') && trimmed.endsWith('"'))
    );
  }

  if (program === "grep") {
    return args.some((arg) =>
      ["-c", "--count", "-l", "--files-with-matches", "-L", "--files-without-match", "-o", "--only-matching", "-Z", "--null"].includes(arg),
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
  exact?: string;
};

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
}
