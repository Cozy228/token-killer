import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";

// RTK: js/prettier_cmd.rs — show only files that need formatting.
// RTK: core/truncate.rs::CAP_WARNINGS = 10 (MAX_PRETTIER_FILES).
const MAX_PRETTIER_FILES = 10;

// RTK: js/prettier_cmd.rs uses a 39-char box-drawing separator under the summary.
const PRETTIER_SEPARATOR = "═".repeat(39);

// Match a bare `prettier …` invocation OR a package-runner wrapper such as
// `pnpm exec prettier --check` / `npx prettier`. `original` is the raw argv array,
// so `.includes("prettier")` is an exact-element test (not a substring scan): it
// catches the wrapped binary without misfiring on values like `-m "fix prettier"`.
// Mirrors matchesEslint so the two formatters route consistently under runners.
function matchesPrettier(command: ParsedCommand): boolean {
  return command.program === "prettier" || command.original.includes("prettier");
}

// RTK: js/prettier_cmd.rs::filter_prettier_output — only these extensions are
// counted as files-to-format lines.
function isFormattableFile(trimmed: string): boolean {
  return (
    trimmed.endsWith(".ts") ||
    trimmed.endsWith(".tsx") ||
    trimmed.endsWith(".js") ||
    trimmed.endsWith(".jsx") ||
    trimmed.endsWith(".json") ||
    trimmed.endsWith(".md") ||
    trimmed.endsWith(".css") ||
    trimmed.endsWith(".scss")
  );
}

// RTK: js/prettier_cmd.rs::filter_prettier_output — faithful port.
function filterPrettierOutput(output: string): string {
  // RTK: #221 — empty or whitespace-only output means prettier didn't run.
  if (output.trim() === "") {
    return "Error: prettier produced no output";
  }

  const filesToFormat: string[] = [];
  let filesChecked = 0;
  let isCheckMode = true;

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();

    // Detect check mode vs write mode.
    if (trimmed.includes("Checking formatting")) {
      isCheckMode = true;
    }

    // Count files that need formatting (check mode).
    if (
      trimmed !== "" &&
      !trimmed.startsWith("Checking") &&
      !trimmed.startsWith("All matched") &&
      !trimmed.startsWith("Code style") &&
      !trimmed.includes("[warn]") &&
      !trimmed.includes("[error]") &&
      isFormattableFile(trimmed)
    ) {
      filesToFormat.push(trimmed);
    }

    // Count total files checked.
    if (trimmed.includes("All matched files use Prettier")) {
      const countStr = trimmed.split(/\s+/)[0];
      const count = countStr !== undefined ? Number.parseInt(countStr, 10) : Number.NaN;
      if (Number.isInteger(count)) {
        filesChecked = count;
      }
    }
  }

  // Check if all files are formatted.
  if (filesToFormat.length === 0 && output.includes("All matched files use Prettier")) {
    return "Prettier: All files formatted correctly";
  }

  // Check if files were written (write mode).
  if (output.includes("modified") || output.includes("formatted")) {
    isCheckMode = false;
  }

  const result: string[] = [];

  if (isCheckMode) {
    // Check mode: show files that need formatting.
    if (filesToFormat.length === 0) {
      result.push("Prettier: All files formatted correctly");
    } else {
      result.push(`Prettier: ${filesToFormat.length} files need formatting`);
      result.push(PRETTIER_SEPARATOR);

      filesToFormat.slice(0, MAX_PRETTIER_FILES).forEach((file, i) => {
        result.push(`${i + 1}. ${file}`);
      });

      if (filesToFormat.length > MAX_PRETTIER_FILES) {
        result.push("");
        result.push(`... +${filesToFormat.length - MAX_PRETTIER_FILES} more files`);
      }

      if (filesChecked > 0) {
        result.push("");
        result.push(`${filesChecked - filesToFormat.length} files already formatted`);
      }
    }
  } else {
    // Write mode: show what was formatted.
    result.push(`Prettier: ${filesToFormat.length} files formatted`);
  }

  return result.join("\n").trim();
}

export const prettierHandler: CommandHandler = {
  name: "prettier",
  programs: ["prettier"],

  matches: matchesPrettier,

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, _command, options) {
    return makeFilteredResult(
      this.name,
      raw,
      `${filterPrettierOutput(`${raw.stdout}\n${raw.stderr}`)}\n`,
      options,
    );
  },
};
