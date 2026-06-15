import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

import { expectMeaningfulBody } from "../../helpers/assertions.js";
import { fixtureCases, toParsedCommand } from "../../helpers/fixtureCases.js";
import { routeCommand } from "../../../src/router.js";
import type { RawResult, TkOptions } from "../../../src/types.js";

// Forbidden in every fixture's compressed output. The `+N more` pattern matches
// the marker SHAPE (any/no trailing noun) — the old version anchored a fixed noun
// list, so real markers like `... +N more failures` / `… +N more` / `+N more rows`
// slipped through and a regression could ship a fixture that hid evidence (ADR
// 0001 finding #8). Mirrors src/handlers/base.ts OMISSION_MARKERS.
const LOSSY_OMISSION_PATTERNS = [
  /\bHidden:/,
  /\bnot shown\b/,
  /\btruncated\b/,
  /\bomitted\b/,
  /\bmore lines\b/,
  /\+\s*\d+\s+more\b/,
  /\(more changes truncated\)/,
];

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const options: TkOptions = {
  raw: false,
  stats: false,
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
  // Fixtures use the `__HOME__` placeholder for home-anchored paths so a handler
  // that compacts $HOME to ~ (e.g. git worktree) yields identical output on any
  // machine — CI's home is /home/runner, not the author's /Users/... .
  const fixture = (await readFile(path.join(repoRoot, testCase.fixture), "utf8")).replaceAll(
    "__HOME__",
    homedir(),
  );

  return handler.filter(raw(testCase.command, fixture, testCase.exitCode ?? 0), command, options);
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
      expect(result.outputChars).toBeLessThanOrEqual(result.rawChars + testCase.maxOutputGrowth);
    }

    expectMeaningfulBody(result.output);
    expect(result.handler).not.toBe("generic");
  });
});
