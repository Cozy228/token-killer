import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TkOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

const READ_PROGRAMS = new Set(["cat", "type", "less", "read"]);
type ReadLevel = "minimal" | "balanced" | "aggressive";
type ReadOptions = {
  level: ReadLevel;
  files: string[];
  maxLines?: number;
  tailLines?: number;
  lineNumbers: boolean;
};

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

function filterOutput(text: string, command: ParsedCommand, readConfig: ReadOptions): string {
  const { level, files } = readConfig;
  const fileArg = files[0] ?? command.displayCommand;
  const lineCount = text.split(/\r?\n/).length;
  const shouldSummarize = text.length > 12000 || lineCount > 200;

  if (command.program === "read" && shouldSummarize && level === "aggressive") {
    return summarizeAggressively(fileArg, text);
  }

  return text;
}

function summarizeAggressively(filePath: string, text: string): string {
  const lines = text.split(/\r?\n/);
  const symbols = extractSymbols(text);

  return [
    `File: ${filePath}`,
    `Lines: ${lines.length}`,
    symbols.length > 0 ? "\nSymbols:\n" + symbols.map((line) => `- ${line.trim()}`).join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function parseReadLevel(value: string | undefined): ReadLevel | undefined {
  if (value === "balance") return "balanced";
  if (value === "minimal" || value === "balanced" || value === "aggressive") return value;
  return undefined;
}

function parsePositiveInt(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function readOptions(command: ParsedCommand): ReadOptions {
  const files: string[] = [];
  let level: ReadLevel = "balanced";
  let maxLines: number | undefined;
  let tailLines: number | undefined;
  let lineNumbers = false;

  for (let index = 0; index < command.args.length; index += 1) {
    const arg = command.args[index];
    if (command.program === "read" && (arg === "--level" || arg === "-l")) {
      level = parseReadLevel(command.args[index + 1]) ?? level;
      index += 1;
      continue;
    }
    if (command.program === "read" && (arg === "--max-lines" || arg === "-m")) {
      maxLines = parsePositiveInt(command.args[index + 1]) ?? maxLines;
      index += 1;
      continue;
    }
    if (command.program === "read" && arg?.startsWith("--max-lines=")) {
      maxLines = parsePositiveInt(arg.slice("--max-lines=".length)) ?? maxLines;
      continue;
    }
    if (command.program === "read" && arg === "--tail-lines") {
      tailLines = parsePositiveInt(command.args[index + 1]) ?? tailLines;
      index += 1;
      continue;
    }
    if (command.program === "read" && arg?.startsWith("--tail-lines=")) {
      tailLines = parsePositiveInt(arg.slice("--tail-lines=".length)) ?? tailLines;
      continue;
    }
    if (command.program === "read" && (arg === "--line-numbers" || arg === "-n")) {
      lineNumbers = true;
      continue;
    }
    if (command.program === "read" && arg?.startsWith("--level=")) {
      level = parseReadLevel(arg.slice("--level=".length)) ?? level;
      continue;
    }
    if (command.program === "read" && arg === "-") {
      files.push(arg);
      continue;
    }
    if (arg && !arg.startsWith("-")) {
      files.push(arg);
    }
  }

  return { level, files, maxLines, tailLines, lineNumbers };
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
    process.stdin.on("error", reject);
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

async function readInternally(command: ParsedCommand, options: TkOptions): Promise<RawResult | undefined> {
  const { files } = readOptions(command);
  if (files.length === 0) return undefined;

  const started = Date.now();
  try {
    const chunks: string[] = [];
    let stdinSeen = false;
    let stderr = "";
    let hadError = false;
    for (const fileArg of files) {
      if (fileArg === "-") {
        if (stdinSeen) {
          stderr += "rtk: warning: stdin specified more than once\n";
          continue;
        }
        stdinSeen = true;
        chunks.push(await readStdin());
        continue;
      }
      const absolute = path.resolve(options.cwd, fileArg);
      try {
        const info = await stat(absolute);
        if (!info.isFile()) {
          stderr += `cat: ${fileArg}: not a file\n`;
          hadError = true;
          continue;
        }
        const buffer = await readFile(absolute);
        chunks.push(looksBinary(buffer) ? `Binary file omitted: ${fileArg}\n` : buffer.toString("utf8"));
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
        const message =
          code === "ENOENT"
            ? "No such file or directory (os error 2)"
            : error instanceof Error
              ? error.message
              : String(error);
        stderr += `cat: ${fileArg}: ${message}\n`;
        hadError = true;
      }
    }

    return {
      command: command.displayCommand,
      stdout: chunks.join(""),
      stderr,
      exitCode: hadError ? 1 : 0,
      durationMs: Date.now() - started,
    };
  } catch {
    return undefined;
  }
}

function applyLineWindow(text: string, options: ReadOptions): string {
  if (options.tailLines !== undefined) {
    if (options.tailLines === 0) return "";
    const lines = text.split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    const selected = lines.slice(Math.max(0, lines.length - options.tailLines));
    return selected.join("\n") + (text.endsWith("\n") ? "\n" : "");
  }

  if (options.maxLines !== undefined) {
    if (options.maxLines === 0) return "";
    const lines = text.split(/\r?\n/);
    if (lines.at(-1) === "") lines.pop();
    if (lines.length <= options.maxLines) {
      return lines.join("\n") + (text.endsWith("\n") ? "\n" : "");
    }
    const selected = lines.slice(0, options.maxLines);
    return selected.join("\n") + (text.endsWith("\n") ? "\n" : "");
  }

  return text;
}

function addLineNumbers(text: string): string {
  const lines = text.split(/\r?\n/);
  const hadTrailingNewline = lines.at(-1) === "";
  if (hadTrailingNewline) lines.pop();
  const width = String(lines.length).length;
  const numbered = lines.map((line, index) => `${String(index + 1).padStart(width, " ")} | ${line}`);
  return numbered.join("\n") + (hadTrailingNewline && numbered.length > 0 ? "\n" : "");
}

export const readLikeHandler: CommandHandler = {
  name: "read-like",

  matches(command) {
    return READ_PROGRAMS.has(command.program);
  },

  async execute(command, options) {
    return (await readInternally(command, options)) ?? executeCommand(command);
  },

  async filter(raw, command, options) {
    const text = `${raw.stdout}${raw.stderr}`;
    const readConfig = readOptions(command);
    const filtered = filterOutput(text, command, readConfig);
    const windowed = applyLineWindow(filtered, readConfig);
    const output = readConfig.lineNumbers ? addLineNumbers(windowed) : windowed;
    const lineCount = text.split(/\r?\n/).length;
    const resultOptions =
      command.program === "read" && readConfig.level === "minimal"
        ? {
            ...options,
            maxLines: Math.max(options.maxLines, lineCount),
            maxChars: Math.max(options.maxChars, text.length),
          }
        : options;
    return makeFilteredResult(this.name, raw, output, resultOptions);
  },
};
