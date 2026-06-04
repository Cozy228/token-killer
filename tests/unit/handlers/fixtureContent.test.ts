import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { expectMeaningfulBody } from "../../helpers/assertions.js";
import { fixtureCases, toParsedCommand } from "../../helpers/fixtureCases.js";
import { routeCommand } from "../../../src/router.js";
import type { RawResult, TgOptions } from "../../../src/types.js";

const LOSSY_OMISSION_PATTERNS = [
  /\bHidden:/,
  /\bnot shown\b/,
  /\btruncated\b/,
  /\bomitted\b/,
  /\bmore lines\b/,
  /\+\d+ more (matches|files|packages|errors|commits|branches|changed lines)/,
];

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
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

function raw(command: string[], stdout: string, exitCode = 0): RawResult {
  return {
    command: command.join(" "),
    stdout,
    stderr: "",
    exitCode,
    durationMs: 1,
  };
}

async function filterFixture(testCase: (typeof fixtureCases)[number]) {
  const command = toParsedCommand(testCase.command);
  const handler = routeCommand(command);
  const fixture = await readFile(path.join(repoRoot, testCase.fixture), "utf8");

  return handler.filter(
    raw(testCase.command, fixture, testCase.exitCode ?? 0),
    command,
    options,
  );
}

describe("handler fixture content correctness", () => {
  test.each(fixtureCases)("$name", async (testCase) => {
    const result = await filterFixture(testCase);

    for (const expected of testCase.critical) {
      expect(result.output).toContain(expected);
    }

    for (const pattern of testCase.forbidden ?? []) {
      expect(result.output).not.toMatch(pattern);
    }

    for (const pattern of LOSSY_OMISSION_PATTERNS) {
      expect(result.output).not.toMatch(pattern);
    }

    if (testCase.maxOutputGrowth !== undefined) {
      expect(result.outputChars).toBeLessThanOrEqual(
        result.rawChars + testCase.maxOutputGrowth,
      );
    }

    expectMeaningfulBody(result.output);
    expect(result.handler).not.toBe("generic");
  });
});
