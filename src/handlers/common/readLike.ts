import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

const READ_PROGRAMS = new Set(["cat", "type", "less"]);

function looksBinary(buffer: Buffer): boolean {
  return buffer.subarray(0, 8000).includes(0);
}

function extractSymbols(text: string): string[] {
  return text
    .split(/\r?\n/)
    .filter((line) =>
      /^(import |from |export |function |const \w+\s*=|class |interface |type |def |package )/.test(
        line,
      ),
    )
    .slice(0, 40);
}

function excerpt(lines: string[], count: number): string {
  const filtered = lines.filter((line) => !/^\s*const noise\d+\s*=/.test(line));
  return filtered.slice(0, count).join("\n");
}

function summarizeLargeFile(filePath: string, text: string): string {
  const lines = text.split(/\r?\n/);
  const symbols = extractSymbols(text);
  const head = excerpt(lines, 30);
  const tail = excerpt(lines.slice(-80), 20);

  return [
    `File: ${filePath}`,
    `Lines: ${lines.length}`,
    symbols.length > 0 ? "\nSymbols:\n" + symbols.map((line) => `- ${line.trim()}`).join("\n") : "",
    "\nHead:",
    head,
    "\nTail:",
    tail,
  ]
    .filter(Boolean)
    .join("\n");
}

async function readInternally(command: ParsedCommand): Promise<RawResult | undefined> {
  const fileArg = command.args.find((arg) => !arg.startsWith("-"));
  if (!fileArg) return undefined;

  const started = Date.now();
  try {
    const absolute = path.resolve(process.cwd(), fileArg);
    const info = await stat(absolute);
    if (!info.isFile()) return undefined;
    const buffer = await readFile(absolute);
    if (looksBinary(buffer)) {
      return {
        command: command.displayCommand,
        stdout: `Binary file not shown: ${fileArg}\n`,
        stderr: "",
        exitCode: 0,
        durationMs: Date.now() - started,
      };
    }
    return {
      command: command.displayCommand,
      stdout: buffer.toString("utf8"),
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - started,
    };
  } catch {
    return undefined;
  }
}

export const readLikeHandler: CommandHandler = {
  name: "read-like",

  matches(command) {
    return READ_PROGRAMS.has(command.program);
  },

  async execute(command) {
    return (await readInternally(command)) ?? executeCommand(command);
  },

  async filter(raw, command, options) {
    const text = `${raw.stdout}${raw.stderr}`;
    const fileArg = command.args.find((arg) => !arg.startsWith("-")) ?? command.displayCommand;
    const lineCount = text.split(/\r?\n/).length;
    const output = text.length > 12000 || lineCount > 200 ? summarizeLargeFile(fileArg, text) : text;
    return makeFilteredResult(this.name, raw, output, options);
  },
};
