import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TkOptions } from "../../types.js";
import { makeFilteredResult } from "../base.js";
import { type LadderResult, overBudgetLadder } from "./budget.js";

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

export function lcsChanges(oldLines: string[], newLines: string[]): DiffChange[] {
  const common = Array.from({ length: oldLines.length + 1 }, () =>
    Array<number>(newLines.length + 1).fill(0),
  );

  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      common[oldIndex]![newIndex] =
        oldLines[oldIndex] === newLines[newIndex]
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

function formatDiffOutput(
  oldPath: string,
  newPath: string,
  _oldMtime: Date,
  _newMtime: Date,
  oldText: string,
  newText: string,
): string {
  const changes = lcsChanges(splitLines(oldText), splitLines(newText));
  if (changes.length === 0) {
    return `${oldPath} -> ${newPath}\n[ok] Files are identical\n`;
  }

  const added = changes.filter((change) => change.kind === "added").length;
  const removed = changes.length - added;
  const lines = [`${oldPath} -> ${newPath} (+${added} -${removed})`, ""];

  for (const change of changes) {
    if (change.kind === "added") {
      lines.push(`+ ${change.content}`);
    } else {
      lines.push(`- ${change.content}`);
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

  // Every +/- line is shown in full — diff hunks are location-class and are never
  // capped (CONTEXT.md). The header already carries the exact `(+added -removed)`
  // count, so the old `... +N more` footer noted a size it had NOT omitted: a
  // false omission marker that tripped the Safe-Compression-Gate for nothing
  // (ADR 0001 — no `+N more` anywhere). Removed; no evidence is dropped here.
  output.push(`[file] ${currentFile} (+${added} -${removed})`);
  for (const change of changes) {
    output.push(`  ${change}`);
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

    if (line.startsWith("diff --git") || line.startsWith("--- ")) {
      continue;
    }

    // H8-diff fix: keep @@ hunk headers — they locate the change in the file
    // (line numbers) and are essential for "did it change and where?" checks.
    // The old code dropped them, which also broke binary/rename detection.
    if (line.startsWith("@@")) {
      changes.push(line);
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

async function diffInternally(
  command: ParsedCommand,
  options: TkOptions,
): Promise<RawResult | undefined> {
  const [oldPath, newPath] = fileArgs(command);
  if (!oldPath || !newPath) return undefined;

  // H8-diff fix: if any flag is present (-w/-i/-q/-u/etc.), fall through to the
  // real `diff` so the flags are honoured and the exit code is correct. The LCS
  // path ignores flags and always returns exitCode:0 even when files differ,
  // breaking "did it change?" checks. -q in particular REQUIRES exit 1 on diff.
  const hasFlags = command.args.some((a) => a.startsWith("-"));
  if (hasFlags) return undefined;

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

    // Guard the dense O(n·m) LCS matrix (audit #12): two 5,000-line files allocate
    // ~25M cells (~200 MB) on the hot path. Above a cell cap, fall through to the
    // real `diff` (lossless) instead of risking a memory/time cliff — compression
    // uncertain ⇒ return raw.
    if (splitLines(oldText).length * splitLines(newText).length > 4_000_000) {
      return undefined;
    }

    const changes = lcsChanges(splitLines(oldText), splitLines(newText));
    // H8-diff fix: propagate the correct exit code. GNU diff exits 1 when files
    // differ and 0 when identical — the LCS result tells us which.
    const exitCode = changes.length > 0 ? 1 : 0;
    return {
      command: command.displayCommand,
      stdout: formatDiffOutput(oldPath, newPath, oldInfo.mtime, newInfo.mtime, oldText, newText),
      stderr: "",
      exitCode,
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
  traits: { structural: true, ladder: true, cacheable: true, ttlClass: "fast" },
  programs: ["diff"],

  matches(command) {
    return command.program === "diff";
  },

  async execute(command, options) {
    const fileOperands = fileArgs(command); // real file paths (excludes flags and `-`)
    const hasStdin = command.args.includes("-");
    // `diff <file> -` (a real file PLUS stdin) is a real diff against stdin — run the
    // real `diff` so flags are honoured and exit 1 propagates on a difference (H8).
    if (hasStdin && fileOperands.length >= 1) {
      return executeCommand(command);
    }
    // A BARE `diff -` (the only operand is `-`) is the RTK convention for "condense a
    // unified diff piped on stdin" (`git diff | ctx diff -`), NOT a real diff — real
    // `diff -` errors with "missing operand". Read stdin so filter() can condense it.
    if (hasStdin) {
      return diffFromStdin(command);
    }
    return (await diffInternally(command, options)) ?? executeCommand(command);
  },

  async filter(raw, command, options) {
    const output = `${raw.stdout}${raw.stderr}`;
    const filtered =
      command.args.includes("-") || isUnifiedDiff(output)
        ? condenseUnifiedDiff(output)
        : output.trimEnd();
    const body = filtered.trim() ? `${filtered.trimEnd()}\n` : "[ok] Files are identical\n";

    // ADR 0001: a very large diff must not ship unbounded. Diff lines are
    // location-class (never count-capped), so over budget the listing is replaced
    // by the per-file `(+added -removed)` summary lines + the snapshot pointer.
    // A non-unified diff has NO such summary lines — there is nothing to reduce, so
    // ship the full body with NO omission (declaring a "replacement" that replaced
    // nothing would mislabel a complete dump as a lossy step-2 reduction).
    const summaryLines = body
      .split("\n")
      .filter((line) => /^\[file\] |->.*\(\+\d+ -\d+\)/.test(line));
    const ladder: LadderResult =
      summaryLines.length > 0
        ? overBudgetLadder({ full: body, replacement: () => `${summaryLines.join("\n")}\n` })
        : { text: body };
    return makeFilteredResult(this, raw, ladder.text, options, undefined, ladder.omission);
  },
};
