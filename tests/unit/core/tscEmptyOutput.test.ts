import { describe, expect, test } from "vitest";

import { tscHandler } from "../../../src/handlers/js/tsc.js";
import type { ParsedCommand, RawResult, TkOptions } from "../../../src/types.js";

const options: TkOptions = {
  raw: false,
  stats: false,
  maxLines: 120,
  maxChars: 12000,
  saveRaw: false,
  cwd: process.cwd(),
};

const command: ParsedCommand = {
  program: "tsc",
  args: ["--noEmit"],
  original: ["tsc", "--noEmit"],
  displayCommand: "tsc --noEmit",
};

const emptyRaw: RawResult = {
  command: "tsc --noEmit",
  stdout: "",
  stderr: "",
  exitCode: 0,
  durationMs: 1,
};

describe("tsc empty output", () => {
  test("keeps a clean compiler run empty", async () => {
    const result = await tscHandler.filter(emptyRaw, command, options);

    expect(result.output).toBe("");
    expect(result.outputTokens).toBe(0);
    expect(result.qualityStatus).toBe("passed");
  });
});
