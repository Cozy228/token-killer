import { executeCommand } from "../../executor.js";
import type { CommandHandler } from "../../types.js";
import { makeFilteredResult } from "../base.js";

// RTK: mypy_cmd.rs uses a 39-char box-drawing separator under the summary line.
const MYPY_SEPARATOR = "═".repeat(39);

type MypyError = {
  file: string;
  line: string;
  code: string;
  message: string;
  notes: string[];
};

// RTK: mypy_cmd.rs::MYPY_DIAG — "file.py:12: error: Message [code]" (optional column).
const MYPY_DIAG = /^(.+?):(\d+)(?::\d+)?: (error|warning|note): (.+?)(?:\s+\[(.+)\])?$/;

// RTK: core/utils.rs::truncate — keep up to max chars, else 117 chars + "...".
function truncate(text: string, maxLen: number): string {
  const chars = [...text];
  if (chars.length <= maxLen) return text;
  if (maxLen < 3) return "...";
  return `${chars.slice(0, maxLen - 3).join("")}...`;
}

// RTK: mypy_cmd.rs::filter_mypy_output — file-less errors verbatim first, then errors
// grouped by file under a "mypy: N errors in M files" header with a Top-codes summary.
function formatMypy(text: string): string {
  const lines = text.split(/\r?\n/);
  const errors: MypyError[] = [];
  const fileless: string[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.startsWith("Found ") && line.includes(" error")) continue;
    if (line.startsWith("Success:")) continue;

    const caps = line.match(MYPY_DIAG);
    if (caps) {
      const severity = caps[3];
      const file = caps[1] ?? "";
      if (severity === "note") {
        const last = errors[errors.length - 1];
        if (last && last.file === file) {
          last.notes.push(caps[4] ?? "");
        } else {
          fileless.push(line);
        }
        continue;
      }
      errors.push({
        file,
        line: caps[2] ?? "0",
        code: caps[5] ?? "",
        message: caps[4] ?? "",
        notes: [],
      });
    } else if (line.includes("error:") && line.trim() !== "") {
      fileless.push(line);
    }
  }

  if (errors.length === 0 && fileless.length === 0) {
    return "mypy: No issues found\n";
  }

  const byFile = new Map<string, MypyError[]>();
  for (const err of errors) {
    const list = byFile.get(err.file) ?? [];
    list.push(err);
    byFile.set(err.file, list);
  }

  const codeCounts = new Map<string, number>();
  for (const err of errors) {
    if (err.code) codeCounts.set(err.code, (codeCounts.get(err.code) ?? 0) + 1);
  }

  const out: string[] = [];
  for (const line of fileless) out.push(line);
  if (fileless.length > 0 && errors.length > 0) out.push("");

  if (errors.length > 0) {
    out.push(`mypy: ${errors.length} errors in ${byFile.size} files`, MYPY_SEPARATOR);

    if (codeCounts.size > 1) {
      const topCodes = [...codeCounts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, 5)
        .map(([code, count]) => `${code} (${count}x)`);
      out.push(`Top codes: ${topCodes.join(", ")}`, "");
    }

    const filesSorted = [...byFile.entries()].sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
    );
    for (const [file, fileErrors] of filesSorted) {
      out.push(`${file} (${fileErrors.length} errors)`);
      for (const err of fileErrors) {
        const head = err.code ? `[${err.code}] ` : "";
        out.push(`  L${err.line}: ${head}${truncate(err.message, 120)}`);
        for (const note of err.notes) out.push(`    ${truncate(note, 120)}`);
      }
      out.push("");
    }
  }

  return `${out.join("\n").trimEnd()}\n`;
}

export const mypyHandler: CommandHandler = {
  name: "mypy",
  programs: ["mypy"],

  matches(command) {
    return command.program === "mypy";
  },

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(this.name, raw, formatMypy(`${raw.stdout}\n${raw.stderr}`), options);
  },
};
