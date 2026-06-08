import type { ParsedCommand } from "../../types.js";
import { defineHandler } from "../define.js";
import { type LadderResult, overBudgetLadder } from "../common/budget.js";

// RTK: js/prettier_cmd.rs — show only files that need formatting. ADR 0001
// decisions 2/5/7: RTK's MAX_PRETTIER_FILES (10) cap + "... +N more files" marker
// is REMOVED. Each path is evidence (no decoration to drop), so within budget every
// file lists; over budget it falls straight to a count replacement (+ snapshot). No
// "... +N more".

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

// RTK: js/prettier_cmd.rs::filter_prettier_output — faithful port (cap → ladder).
function filterPrettierOutput(output: string): LadderResult {
  // RTK: #221 — empty or whitespace-only output means prettier didn't run.
  if (output.trim() === "") {
    return { text: "Error: prettier produced no output" };
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
    return { text: "Prettier: All files formatted correctly" };
  }

  // Check if files were written (write mode).
  if (output.includes("modified") || output.includes("formatted")) {
    isCheckMode = false;
  }

  if (!isCheckMode) {
    // Write mode: show what was formatted.
    return { text: `Prettier: ${filesToFormat.length} files formatted` };
  }

  // Check mode: show files that need formatting.
  if (filesToFormat.length === 0) {
    return { text: "Prettier: All files formatted correctly" };
  }

  const header = `Prettier: ${filesToFormat.length} files need formatting`;
  // ADR 0001: within budget the full numbered listing ships; over budget it falls
  // to the count-only header (a step-2 replacement, snapshot-recoverable). The file
  // paths are pure evidence, so there is no lossless step-1 digest between them.
  const buildFull = (): string => {
    const result = [header, PRETTIER_SEPARATOR];
    filesToFormat.forEach((file, i) => result.push(`${i + 1}. ${file}`));
    if (filesChecked > 0) {
      result.push("");
      result.push(`${filesChecked - filesToFormat.length} files already formatted`);
    }
    return result.join("\n").trim();
  };

  return overBudgetLadder({
    full: buildFull(),
    replacement: () => header,
  });
}

export const prettierHandler = defineHandler({
  name: "prettier",
  programs: ["prettier"],

  match: matchesPrettier,

  format: (raw, _command, options) => {
    const { text, omission } = filterPrettierOutput(`${raw.stdout}\n${raw.stderr}`);
    return { output: `${text}\n`, omission };
  },
});
