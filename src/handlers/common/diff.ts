import { readFile } from "node:fs/promises";
import path from "node:path";

import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

function fileArgs(command: ParsedCommand): string[] {
  return command.args.filter((arg) => !arg.startsWith("-"));
}

function lines(text: string): string[] {
  const split = text.split(/\r?\n/);
  if (split.at(-1) === "") split.pop();
  return split;
}

function buildUnifiedDiff(oldPath: string, newPath: string, oldText: string, newText: string): string {
  if (oldText === newText) return "";

  const oldLines = lines(oldText);
  const newLines = lines(newText);
  const max = Math.max(oldLines.length, newLines.length);
  const outputLines = [
    `diff --git a/${oldPath} b/${newPath}`,
    `--- a/${oldPath}`,
    `+++ b/${newPath}`,
    `@@ -1,${oldLines.length} +1,${newLines.length} @@`,
  ];

  for (let index = 0; index < max; index += 1) {
    const oldLine = oldLines[index];
    const newLine = newLines[index];
    if (oldLine === newLine) {
      if (oldLine !== undefined) outputLines.push(` ${oldLine}`);
      continue;
    }
    if (oldLine !== undefined) outputLines.push(`-${oldLine}`);
    if (newLine !== undefined) outputLines.push(`+${newLine}`);
  }

  return `${outputLines.join("\n")}\n`;
}

async function diffInternally(command: ParsedCommand, options: TgOptions): Promise<RawResult | undefined> {
  const [oldPath, newPath] = fileArgs(command);
  if (!oldPath || !newPath) return undefined;

  const started = Date.now();
  try {
    const oldText = await readFile(path.resolve(options.cwd, oldPath), "utf8");
    const newText = await readFile(path.resolve(options.cwd, newPath), "utf8");
    return {
      command: command.displayCommand,
      stdout: buildUnifiedDiff(oldPath, newPath, oldText, newText),
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - started,
    };
  } catch {
    return undefined;
  }
}

function condenseUnifiedDiff(text: string): string {
  const result: string[] = [];
  let currentFile = "";
  let added = 0;
  let removed = 0;
  let changes: string[] = [];

  function flush() {
    if (!currentFile || (added === 0 && removed === 0)) return;
    result.push(`[file] ${currentFile} (+${added} -${removed})`);
    result.push(...changes.map((line) => `  ${line}`));
  }

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("diff --git") || line.startsWith("--- ")) continue;
    if (line.startsWith("+++ ")) {
      flush();
      currentFile = line.replace(/^\+\+\+ b?\//, "");
      added = 0;
      removed = 0;
      changes = [];
      continue;
    }
    if (line.startsWith("@@")) continue;
    if (line.startsWith("+")) {
      added += 1;
      changes.push(line);
      continue;
    }
    if (line.startsWith("-")) {
      removed += 1;
      changes.push(line);
    }
  }

  flush();
  return result.length > 0 ? `${result.join("\n")}\n` : "";
}

export const diffHandler: CommandHandler = {
  name: "diff",

  matches(command) {
    return command.program === "diff";
  },

  async execute(command, options) {
    return (await diffInternally(command, options)) ?? executeCommand(command);
  },

  async filter(raw, _command, options) {
    const text = `${raw.stdout}${raw.stderr}`;
    const output = text.trim() ? condenseUnifiedDiff(text) || `${text.trimEnd()}\n` : "[ok] Files are identical\n";
    return makeFilteredResult(this.name, raw, output, options);
  },
};
