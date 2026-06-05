import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand } from "../../types.js";
import { makeFilteredResult } from "../base.js";

// RTK: system/format_cmd.rs — `format` is a dispatcher that detects a formatter
// (prettier / ruff / black / biome) and routes raw output to the matching
// per-formatter filter. This is a DISTINCT program from `prettier` (see
// js/prettier.ts); it matches `program === "format"`.

// RTK: core/truncate.rs::CAP_WARNINGS = 10 — cap on listed files-to-format.
const MAX_FORMAT_FILES = 10;

// RTK: filter_black_output / filter_ruff_format use a 39-char box-drawing
// separator under the summary line.
const SEPARATOR = "═".repeat(39);

function matchesFormat(command: ParsedCommand): boolean {
  return command.program === "format";
}

// RTK: system/format_cmd.rs::detect_formatter — if the first arg is a known
// formatter name, use it; otherwise auto-detect. In tg there is no project-file
// probing at filter time, so we honour the explicit formatter arg and default to
// prettier (RTK's package.json detection branch / JS-stack default).
function detectFormatter(args: string[]): string {
  if (args.length > 0) {
    const first = args[0];
    if (first === "prettier" || first === "black" || first === "ruff" || first === "biome") {
      return first;
    }
  }
  return "prettier";
}

// RTK: system/format_cmd.rs::compact_path — strip common path prefixes.
function compactPath(rawPath: string): string {
  const p = rawPath.replace(/\\/g, "/");

  const srcIdx = p.lastIndexOf("/src/");
  if (srcIdx !== -1) {
    return `src/${p.slice(srcIdx + 5)}`;
  }
  const libIdx = p.lastIndexOf("/lib/");
  if (libIdx !== -1) {
    return `lib/${p.slice(libIdx + 5)}`;
  }
  const testsIdx = p.lastIndexOf("/tests/");
  if (testsIdx !== -1) {
    return `tests/${p.slice(testsIdx + 7)}`;
  }
  const slashIdx = p.lastIndexOf("/");
  if (slashIdx !== -1) {
    return p.slice(slashIdx + 1);
  }
  return p;
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

// RTK: format_cmd.rs dispatches prettier output to prettier_cmd::filter_prettier_output.
function filterPrettierOutput(output: string): string {
  if (output.trim() === "") {
    return "Error: prettier produced no output";
  }

  const filesToFormat: string[] = [];
  let filesChecked = 0;
  let isCheckMode = true;

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (trimmed.includes("Checking formatting")) {
      isCheckMode = true;
    }

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

    if (trimmed.includes("All matched files use Prettier")) {
      const countStr = trimmed.split(/\s+/)[0];
      const count = countStr !== undefined ? Number.parseInt(countStr, 10) : Number.NaN;
      if (Number.isInteger(count)) {
        filesChecked = count;
      }
    }
  }

  if (filesToFormat.length === 0 && output.includes("All matched files use Prettier")) {
    return "Prettier: All files formatted correctly";
  }

  if (output.includes("modified") || output.includes("formatted")) {
    isCheckMode = false;
  }

  const result: string[] = [];

  if (isCheckMode) {
    if (filesToFormat.length === 0) {
      result.push("Prettier: All files formatted correctly");
    } else {
      result.push(`Prettier: ${filesToFormat.length} files need formatting`);
      result.push(SEPARATOR);

      filesToFormat.slice(0, MAX_FORMAT_FILES).forEach((file, i) => {
        result.push(`${i + 1}. ${file}`);
      });

      if (filesToFormat.length > MAX_FORMAT_FILES) {
        result.push("");
        result.push(`... +${filesToFormat.length - MAX_FORMAT_FILES} more files`);
      }

      if (filesChecked > 0) {
        result.push("");
        result.push(`${filesChecked - filesToFormat.length} files already formatted`);
      }
    }
  } else {
    result.push(`Prettier: ${filesToFormat.length} files formatted`);
  }

  return result.join("\n").trim();
}

// RTK: python/ruff_cmd.rs::filter_ruff_format — faithful port.
function filterRuffFormat(output: string): string {
  const filesToFormat: string[] = [];
  let filesChecked = 0;

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    if (lower.includes("would reformat:")) {
      const parts = trimmed.split(":");
      if (parts.length > 1) {
        filesToFormat.push(parts[1].trim());
      }
    }

    if (lower.includes("left unchanged")) {
      for (const part of trimmed.split(",")) {
        const partLower = part.toLowerCase();
        if (partLower.includes("left unchanged")) {
          const words = part.split(/\s+/).filter((w) => w !== "");
          for (let i = 0; i < words.length; i += 1) {
            if ((words[i] === "file" || words[i] === "files") && i > 0) {
              const count = Number.parseInt(words[i - 1], 10);
              if (Number.isInteger(count)) {
                filesChecked = count;
                break;
              }
            }
          }
          break;
        }
      }
    }
  }

  const outputLower = output.toLowerCase();

  if (filesToFormat.length === 0 && outputLower.includes("left unchanged")) {
    return "Ruff format: All files formatted correctly";
  }

  const result: string[] = [];

  if (outputLower.includes("would reformat")) {
    if (filesToFormat.length === 0) {
      result.push("Ruff format: All files formatted correctly");
    } else {
      result.push(`Ruff format: ${filesToFormat.length} files need formatting`);
      result.push(SEPARATOR);

      filesToFormat.slice(0, MAX_FORMAT_FILES).forEach((file, i) => {
        result.push(`${i + 1}. ${compactPath(file)}`);
      });

      if (filesToFormat.length > MAX_FORMAT_FILES) {
        result.push("");
        result.push(`... +${filesToFormat.length - MAX_FORMAT_FILES} more files`);
      }

      if (filesChecked > 0) {
        result.push("");
        result.push(`${filesChecked} files already formatted`);
      }

      result.push("");
      result.push("[hint] Run `ruff format` to format these files");
    }
  } else {
    result.push(output.trim());
  }

  return result.join("\n").trim();
}

// RTK: system/format_cmd.rs::filter_black_output — faithful port.
function filterBlackOutput(output: string): string {
  const filesToFormat: string[] = [];
  let filesUnchanged = 0;
  let filesWouldReformat = 0;
  let allDone = false;
  let ohNo = false;

  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();

    // RTK: "would reformat: path/to/file.py"
    if (lower.startsWith("would reformat:")) {
      const parts = trimmed.split(":");
      if (parts.length > 1) {
        filesToFormat.push(parts[1].trim());
      }
    }

    // RTK: parse "2 files would be reformatted, 3 files would be left unchanged."
    if (lower.includes("would be reformatted") || lower.includes("would be left unchanged")) {
      for (const part of trimmed.split(",")) {
        const partLower = part.toLowerCase();
        const words = part.split(/\s+/).filter((w) => w !== "");

        if (partLower.includes("would be reformatted")) {
          for (let i = 0; i < words.length; i += 1) {
            if ((words[i] === "file" || words[i] === "files") && i > 0) {
              const count = Number.parseInt(words[i - 1], 10);
              if (Number.isInteger(count)) {
                filesWouldReformat = count;
                break;
              }
            }
          }
        }

        if (partLower.includes("would be left unchanged")) {
          for (let i = 0; i < words.length; i += 1) {
            if ((words[i] === "file" || words[i] === "files") && i > 0) {
              const count = Number.parseInt(words[i - 1], 10);
              if (Number.isInteger(count)) {
                filesUnchanged = count;
                break;
              }
            }
          }
        }
      }
    }

    // RTK: standalone "X files left unchanged." (not "would be").
    if (lower.includes("left unchanged") && !lower.includes("would be")) {
      const words = trimmed.split(/\s+/).filter((w) => w !== "");
      for (let i = 0; i < words.length; i += 1) {
        if ((words[i] === "file" || words[i] === "files") && i > 0) {
          const count = Number.parseInt(words[i - 1], 10);
          if (Number.isInteger(count)) {
            filesUnchanged = count;
            break;
          }
        }
      }
    }

    if (lower.includes("all done!") || lower.includes("all done ✨")) {
      allDone = true;
    }
    if (lower.includes("oh no!")) {
      ohNo = true;
    }
  }

  const result: string[] = [];
  const needsFormatting = filesToFormat.length > 0 || filesWouldReformat > 0 || ohNo;

  if (!needsFormatting && (allDone || filesUnchanged > 0)) {
    let line = "Format (black): All files formatted";
    if (filesUnchanged > 0) {
      line += ` (${filesUnchanged} files checked)`;
    }
    result.push(line);
  } else if (needsFormatting) {
    const count = filesToFormat.length > 0 ? filesToFormat.length : filesWouldReformat;

    result.push(`Format (black): ${count} files need formatting`);
    result.push(SEPARATOR);

    if (filesToFormat.length > 0) {
      filesToFormat.slice(0, MAX_FORMAT_FILES).forEach((file, i) => {
        result.push(`${i + 1}. ${compactPath(file)}`);
      });

      if (filesToFormat.length > MAX_FORMAT_FILES) {
        result.push("");
        result.push(`... +${filesToFormat.length - MAX_FORMAT_FILES} more files`);
      }
    }

    if (filesUnchanged > 0) {
      result.push("");
      result.push(`${filesUnchanged} files already formatted`);
    }

    result.push("");
    result.push("[hint] Run `black .` to format these files");
  } else {
    result.push(output.trim());
  }

  return result.join("\n").trim();
}

// RTK: system/format_cmd.rs::run — dispatch raw output to the detected formatter's
// filter (prettier -> filter_prettier_output, ruff -> filter_ruff_format,
// black -> filter_black_output, biome/other -> trimmed passthrough).
function filterFormatOutput(formatter: string, raw: string): string {
  switch (formatter) {
    case "prettier":
      return filterPrettierOutput(raw);
    case "ruff":
      return filterRuffFormat(raw);
    case "black":
      return filterBlackOutput(raw);
    default:
      return raw.trim();
  }
}

export const formatHandler: CommandHandler = {
  name: "format",

  matches: matchesFormat,

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw, command, options) {
    const formatter = detectFormatter(command.args);
    return makeFilteredResult(
      this.name,
      raw,
      `${filterFormatOutput(formatter, `${raw.stdout}\n${raw.stderr}`)}\n`,
      options,
    );
  },
};
