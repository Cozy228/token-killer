import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";

type DiffChange =
  | { kind: "added"; newLine: number; content: string }
  | { kind: "removed"; oldLine: number; content: string };

function fileArgs(command: ParsedCommand): string[] {
  return command.args.filter((arg) => !arg.startsWith("-"));
}

function splitLines(text: string): string[] {
  const lines = text.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

function lcsChanges(oldLines: string[], newLines: string[]): DiffChange[] {
  const common = Array.from({ length: oldLines.length + 1 }, () =>
    Array<number>(newLines.length + 1).fill(0),
  );

  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      common[oldIndex]![newIndex] = oldLines[oldIndex] === newLines[newIndex]
        ? common[oldIndex + 1]![newIndex + 1]! + 1
        : Math.max(common[oldIndex + 1]![newIndex]!, common[oldIndex]![newIndex + 1]!);
    }
  }

  const changes: DiffChange[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldLines[oldIndex] === newLines[newIndex]) {
      oldIndex += 1;
      newIndex += 1;
    } else if (
      newIndex < newLines.length &&
      common[oldIndex]![newIndex + 1]! >= (common[oldIndex + 1]?.[newIndex] ?? 0)
    ) {
      changes.push({ kind: "added", newLine: newIndex + 1, content: newLines[newIndex] ?? "" });
      newIndex += 1;
    } else if (oldIndex < oldLines.length) {
      changes.push({ kind: "removed", oldLine: oldIndex + 1, content: oldLines[oldIndex] ?? "" });
      oldIndex += 1;
    } else {
      changes.push({ kind: "added", newLine: newIndex + 1, content: newLines[newIndex] ?? "" });
      newIndex += 1;
    }
  }

  return changes;
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(".000Z", "Z");
}

function formatLineNumber(value: number | "-"): string {
  return String(value).padStart(4, " ");
}

function formatDiffOutput(
  oldPath: string,
  newPath: string,
  oldMtime: Date,
  newMtime: Date,
  oldText: string,
  newText: string,
): string {
  const changes = lcsChanges(splitLines(oldText), splitLines(newText));
  if (changes.length === 0) {
    return [
      `Files: ${oldPath} -> ${newPath}`,
      `Modified: ${oldPath} @ ${formatTimestamp(oldMtime)} -> ${newPath} @ ${formatTimestamp(newMtime)}`,
      "Summary: +0 -0",
      "[ok] Files are identical",
      "",
    ].join("\n");
  }

  const added = changes.filter((change) => change.kind === "added").length;
  const removed = changes.length - added;
  const lines = [
    `Files: ${oldPath} -> ${newPath}`,
    `Modified: ${oldPath} @ ${formatTimestamp(oldMtime)} -> ${newPath} @ ${formatTimestamp(newMtime)}`,
    `Summary: +${added} -${removed}`,
    "",
  ];

  for (const change of changes) {
    if (change.kind === "added") {
      lines.push(`+ ${formatLineNumber("-")}:${formatLineNumber(change.newLine)} | ${change.content}`);
    } else {
      lines.push(`- ${formatLineNumber(change.oldLine)}:${formatLineNumber("-")} | ${change.content}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function isUnifiedDiff(text: string): boolean {
  return /^diff --git /m.test(text) || /^--- .*\n\+\+\+ /m.test(text);
}

function flushUnifiedFile(
  output: string[],
  currentFile: string,
  added: number,
  removed: number,
  changes: string[],
) {
  if (!currentFile || (added === 0 && removed === 0)) return;

  output.push(`[file] ${currentFile} (+${added} -${removed})`);
  const visibleChanges = changes.slice(0, 10);
  for (const change of visibleChanges) {
    output.push(`  ${change}`);
  }
  const hidden = changes.length - visibleChanges.length;
  if (hidden > 0) {
    output.push(`  ... +${hidden} more`);
  }
}

function condenseUnifiedDiff(text: string): string {
  const output: string[] = [];
  let currentFile = "";
  let added = 0;
  let removed = 0;
  let changes: string[] = [];

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      flushUnifiedFile(output, currentFile, added, removed, changes);
      currentFile = line.replace(/^\+\+\+ /, "").replace(/^b\//, "");
      added = 0;
      removed = 0;
      changes = [];
      continue;
    }

    if (line.startsWith("diff --git") || line.startsWith("--- ") || line.startsWith("@@")) {
      continue;
    }

    if (line.startsWith("+")) {
      added += 1;
      changes.push(line);
    } else if (line.startsWith("-")) {
      removed += 1;
      changes.push(line);
    }
  }

  flushUnifiedFile(output, currentFile, added, removed, changes);
  return output.join("\n");
}

async function diffInternally(command: ParsedCommand, options: TgOptions): Promise<RawResult | undefined> {
  const [oldPath, newPath] = fileArgs(command);
  if (!oldPath || !newPath) return undefined;

  const started = Date.now();
  try {
    const oldAbsolute = path.resolve(options.cwd, oldPath);
    const newAbsolute = path.resolve(options.cwd, newPath);
    const [oldText, newText, oldInfo, newInfo] = await Promise.all([
      readFile(oldAbsolute, "utf8"),
      readFile(newAbsolute, "utf8"),
      stat(oldAbsolute),
      stat(newAbsolute),
    ]);

    return {
      command: command.displayCommand,
      stdout: formatDiffOutput(oldPath, newPath, oldInfo.mtime, newInfo.mtime, oldText, newText),
      stderr: "",
      exitCode: 0,
      durationMs: Date.now() - started,
    };
  } catch {
    return undefined;
  }
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function diffFromStdin(command: ParsedCommand): Promise<RawResult> {
  const started = Date.now();
  return {
    command: command.displayCommand,
    stdout: await readStdin(),
    stderr: "",
    exitCode: 0,
    durationMs: Date.now() - started,
  };
}

export const diffHandler: CommandHandler = {
  name: "diff",

  matches(command) {
    return command.program === "diff";
  },

  async execute(command, options) {
    if (command.args.includes("-")) {
      return diffFromStdin(command);
    }
    return (await diffInternally(command, options)) ?? executeCommand(command);
  },

  async filter(raw, command, options) {
    const output = `${raw.stdout}${raw.stderr}`;
    const filtered = command.args.includes("-") || isUnifiedDiff(output)
      ? condenseUnifiedDiff(output)
      : output.trimEnd();

    return makeFilteredResult(this.name, raw, filtered.trim() ? `${filtered.trimEnd()}\n` : "[ok] Files are identical\n", options);
  },
};
