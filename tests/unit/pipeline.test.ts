import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { resolveStoredPath } from "../../src/core/dataDir.js";
import { filterWithFallback } from "../../src/core/pipeline.js";
import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../src/types.js";

function options(cwd: string): TgOptions {
  return {
    raw: false,
    stats: false,
    verbose: false,
    maxLines: 120,
    maxChars: 12000,
    saveRaw: true,
    cwd,
  };
}

describe("pipeline fallback", () => {
  test("falls back to generic raw-preserving output when a handler filter throws", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "tg-fallback-"));
    const tgHome = path.join(dir, "token-guard-data");
    process.env.TOKEN_GUARD_HOME = tgHome;
    const command: ParsedCommand = {
      program: "custom",
      args: [],
      original: ["custom"],
      displayCommand: "custom",
    };
    const raw: RawResult = {
      command: "custom",
      stdout: "ERROR retained fallback line\n",
      stderr: "",
      exitCode: 9,
      durationMs: 1,
    };
    const handler: CommandHandler = {
      name: "throwing",
      matches: () => true,
      execute: async () => raw,
      filter: async () => {
        throw new Error("filter exploded");
      },
    };

    try {
      const result = await filterWithFallback(handler, raw, command, options(dir));

      expect(result.handler).toBe("fallback");
      expect(result.filterError).toBe("filter exploded");
      expect(result.output).toContain("ERROR retained fallback line");
      expect(result.exitCode).toBe(9);
      expect(result.rawOutputPath).toBeDefined();

      const rawLog = await readFile(resolveStoredPath(result.rawOutputPath!), "utf8");
      expect(rawLog).toContain("ERROR retained fallback line");
    } finally {
      delete process.env.TOKEN_GUARD_HOME;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
