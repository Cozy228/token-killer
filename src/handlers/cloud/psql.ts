import { executeCommand } from "../../executor.js";
import type { CommandHandler, ParsedCommand, RawResult, TgOptions } from "../../types.js";
import { makeFilteredResult, rawText } from "../base.js";

// RTK: cloud/psql_cmd.rs — PostgreSQL client output compression. Detects table
// and expanded display formats, strips borders/padding/(N rows) footers, and
// produces compact tab-separated or "[N] key=value" output. Other output
// (COPY results, notices, SET, etc.) passes through unchanged.

// RTK: cloud/psql_cmd.rs::MAX_TABLE_ROWS / MAX_EXPANDED_RECORDS = CAP_LIST.
// truncate.rs::CAP_LIST = 20.
const MAX_TABLE_ROWS = 20;
const MAX_EXPANDED_RECORDS = 20;

// RTK: cloud/psql_cmd.rs lazy_static regexes.
const EXPANDED_RECORD = /-\[ RECORD \d+ \]-/;
const SEPARATOR = /^[-+]+$/;
const ROW_COUNT = /^\(\d+ rows?\)$/;
const RECORD_HEADER = /^-\[ RECORD (\d+) \]-/;

// RTK: cloud/psql_cmd.rs::is_table_format — a separator line of dashes joined by
// "+" markers ("-+-" / "---+---") only appears in psql's aligned table format.
function isTableFormat(output: string): boolean {
  return output.split("\n").some((line) => {
    const trimmed = line.trim();
    return trimmed.includes("-+-") || trimmed.includes("---+---");
  });
}

// RTK: cloud/psql_cmd.rs::is_expanded_format.
function isExpandedFormat(output: string): boolean {
  return EXPANDED_RECORD.test(output);
}

// RTK: cloud/psql_cmd.rs::filter_table — strip separator lines (----+----) and
// the (N rows) footer, trim column padding, emit tab-separated rows. The header
// row is always kept; data rows are capped at MAX_TABLE_ROWS with an overflow
// summary.
function filterTable(output: string): string {
  const result: string[] = [];
  let dataRows = 0;
  let totalRows = 0;

  for (const line of output.split("\n")) {
    const trimmed = line.trim();

    // Skip separator lines.
    if (SEPARATOR.test(trimmed)) {
      continue;
    }

    // Skip row count footer.
    if (ROW_COUNT.test(trimmed)) {
      continue;
    }

    // Skip empty lines.
    if (trimmed === "") {
      continue;
    }

    // A data or header row with | delimiters.
    if (trimmed.includes("|")) {
      totalRows += 1;
      // First row is the header, don't count it as data.
      if (totalRows > 1) {
        dataRows += 1;
      }

      if (dataRows <= MAX_TABLE_ROWS || totalRows === 1) {
        const cols = trimmed.split("|").map((c) => c.trim());
        result.push(cols.join("\t"));
      }
    } else {
      // Non-table line (e.g., command output like SET, NOTICE).
      result.push(trimmed);
    }
  }

  if (dataRows > MAX_TABLE_ROWS) {
    result.push(`... +${dataRows - MAX_TABLE_ROWS} more rows`);
  }

  return result.join("\n");
}

// RTK: cloud/psql_cmd.rs::filter_expanded — convert "-[ RECORD N ]-" blocks to
// a one-liner "[N] key=val key=val" form, stripping the (N rows) footer. Records
// are capped at MAX_EXPANDED_RECORDS with an overflow summary.
function filterExpanded(output: string): string {
  const result: string[] = [];
  let currentPairs: string[] = [];
  let currentRecord: string | undefined;
  let recordCount = 0;

  for (const line of output.split("\n")) {
    const trimmed = line.trim();

    if (ROW_COUNT.test(trimmed)) {
      continue;
    }

    const header = RECORD_HEADER.exec(trimmed);
    if (header) {
      // Flush previous record.
      if (currentRecord !== undefined) {
        if (recordCount <= MAX_EXPANDED_RECORDS) {
          result.push(`${currentRecord} ${currentPairs.join(" ")}`);
        }
        currentPairs = [];
      }
      recordCount += 1;
      currentRecord = `[${header[1]}]`;
    } else if (trimmed.includes("|") && currentRecord !== undefined) {
      // key | value line — split on the FIRST pipe only.
      const idx = trimmed.indexOf("|");
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      currentPairs.push(`${key}=${val}`);
    } else if (trimmed === "") {
      continue;
    } else if (currentRecord === undefined) {
      // Non-record line before any record (notices, etc.).
      result.push(trimmed);
    }
  }

  // Flush last record.
  if (currentRecord !== undefined) {
    if (recordCount <= MAX_EXPANDED_RECORDS) {
      result.push(`${currentRecord} ${currentPairs.join(" ")}`);
    }
  }

  if (recordCount > MAX_EXPANDED_RECORDS) {
    result.push(`... +${recordCount - MAX_EXPANDED_RECORDS} more records`);
  }

  return result.join("\n");
}

// RTK: cloud/psql_cmd.rs::filter_psql_output — route to expanded vs table vs
// passthrough. Empty input yields empty output.
function filterPsqlOutput(output: string): string {
  if (output.trim() === "") {
    return "";
  }

  if (isExpandedFormat(output)) {
    return filterExpanded(output);
  }
  if (isTableFormat(output)) {
    return filterTable(output);
  }
  // Passthrough: COPY results, notices, etc.
  return output;
}

export const psqlHandler: CommandHandler = {
  name: "psql",
  programs: ["psql"],

  matches(command: ParsedCommand) {
    return command.program === "psql";
  },

  execute(command) {
    return executeCommand(command);
  },

  async filter(raw: RawResult, _command, options: TgOptions) {
    // RTK: cloud/psql_cmd.rs::run uses RunOptions::stdout_only() — only stdout is
    // filtered. tg's rawText merges stdout+stderr; on the success path stderr is
    // empty, matching RTK. The filter operates on the merged raw text.
    return makeFilteredResult(this.name, raw, filterPsqlOutput(rawText(raw)), options);
  },
};
