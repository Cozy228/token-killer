import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { resolveStoredPath } from "../../src/core/dataDir.js";
import { filterWithFallback, runPipeline } from "../../src/core/pipeline.js";
import { makeFilteredResult } from "../../src/handlers/base.js";
import { writeFile } from "node:fs/promises";
import type { CommandHandler, ParsedCommand, RawResult, TkOptions } from "../../src/types.js";

function options(cwd: string): TkOptions {
  return {
    raw: false,
    stats: false,
    maxLines: 120,
    maxChars: 12000,
    saveRaw: true,
    cwd,
  };
}

describe("pipeline fallback", () => {
  test("falls back to generic raw-preserving output when a handler filter throws", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-fallback-"));
    const tkHome = path.join(dir, "contexa-data");
    process.env.CONTEXA_HOME = tkHome;
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
      delete process.env.CONTEXA_HOME;
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("C6: a recordHistory write failure never re-runs the command", async () => {
    // The command has already executed once. If accounting throws (unwritable home)
    // and that throw escapes, cli.ts's fail-open catch re-spawns the command —
    // double-executing side effects. runPipeline must swallow the failure so the
    // command runs exactly once and its output survives.
    const dir = await mkdtemp(path.join(tmpdir(), "ctx-c6-"));
    // A FILE where a directory is needed: every write under it fails with ENOTDIR.
    const blocker = path.join(dir, "blocker");
    await writeFile(blocker, "x");
    process.env.CONTEXA_HOME = path.join(blocker, "home");

    let executions = 0;
    const raw: RawResult = {
      command: "fakegrep",
      stdout: "match line\n",
      stderr: "",
      exitCode: 0,
      durationMs: 1,
    };
    const command: ParsedCommand = {
      program: "fakegrep",
      args: [],
      original: ["fakegrep"],
      displayCommand: "fakegrep",
    };
    const handler: CommandHandler = {
      name: "spy",
      matches: () => true,
      execute: async () => {
        executions += 1;
        return raw;
      },
      filter: (r, _c, o) => makeFilteredResult({ name: "spy" }, r, "match line\n", o),
    };

    try {
      const result = await runPipeline(handler, command, options(dir));
      // Accounting is now deferred to commit() — the same fail-open invariant must hold
      // there: the unwritable home makes recordHistory throw, and commit must swallow it
      // so nothing escapes into cli.ts's fail-open catch (which would re-spawn — C6).
      await expect(result.commit()).resolves.toBeUndefined();
      expect(executions).toBe(1); // never re-executed despite the accounting failure
      expect(result.filtered.output).toContain("match line");
      expect(result.filtered.exitCode).toBe(0);
    } finally {
      delete process.env.CONTEXA_HOME;
      await rm(dir, { recursive: true, force: true });
    }
  });
});
