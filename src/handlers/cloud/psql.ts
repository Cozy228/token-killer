import type { OmissionDeclaration, ParsedCommand, RawResult, TkOptions } from "../../types.js";
import { rawText } from "../base.js";
import { overBudgetLadder } from "../common/budget.js";
import { defineHandler } from "../define.js";

// RTK: cloud/psql_cmd.rs — PostgreSQL client output compression. Detects table
// and expanded display formats, strips borders/padding/(N rows) footers, and
// produces compact tab-separated or "[N] key=value" output. Other output
// (COPY results, notices, SET, etc.) passes through unchanged.
//
// ADR 0001 (intentional divergence from RTK's CAP_LIST=20): SQL rows/records are
// evidence — a dropped row is a query result the agent cannot recover. The fixed
// caps are removed: every row/record is emitted below the token budget; over
// budget the listing is replaced by an aggregate count + snapshot pointer (a flat
// all-evidence list has no lossless reduction step, ADR decision 7). No `+N more`.

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
function filterTable(output: string): { text: string; header: string; dataRows: number } {
  const result: string[] = [];
  let header = "";
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
      const cols = trimmed
        .split("|")
        .map((c) => c.trim())
        .join("\t");
      // First row is the header, don't count it as data.
      if (totalRows === 1) {
        header = cols;
      } else {
        dataRows += 1;
      }
      result.push(cols);
    } else {
      // Non-table line (e.g., command output like SET, NOTICE).
      result.push(trimmed);
    }
  }

  return { text: result.join("\n"), header, dataRows };
}

// RTK: cloud/psql_cmd.rs::filter_expanded — convert "-[ RECORD N ]-" blocks to
// a one-liner "[N] key=val key=val" form, stripping the (N rows) footer. Records
// are capped at MAX_EXPANDED_RECORDS with an overflow summary.
function filterExpanded(output: string): { text: string; recordCount: number } {
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
        result.push(`${currentRecord} ${currentPairs.join(" ")}`);
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
    result.push(`${currentRecord} ${currentPairs.join(" ")}`);
  }

  return { text: result.join("\n"), recordCount };
}

// RTK: cloud/psql_cmd.rs::filter_psql_output — route to expanded vs table vs
// passthrough. Empty input yields empty output. Over budget, each listing is
// replaced wholesale by a count + snapshot pointer (ADR 0001 step 2).
function filterPsqlOutput(output: string): { text: string; omission?: OmissionDeclaration } {
  if (output.trim() === "") {
    return { text: "" };
  }

  if (isExpandedFormat(output)) {
    const { text, recordCount } = filterExpanded(output);
    return overBudgetLadder({
      full: text,
      replacement: () => `${recordCount} records (over budget)`,
    });
  }
  if (isTableFormat(output)) {
    const { text, header, dataRows } = filterTable(output);
    return overBudgetLadder({
      full: text,
      // The header (column names) is schema context, not a data row, so it stays;
      // every DATA row goes to the snapshot the gate persists + points at.
      replacement: () => `${header}\n${dataRows} rows (over budget)`,
    });
  }
  // Passthrough: COPY results, notices, etc. A large COPY stream is still evidence,
  // so it goes through the same ladder rather than shipping unbounded (F4) — there
  // is no lossless reduction for an opaque blob, so it falls straight to a line
  // count + snapshot pointer over budget.
  const lineCount = output.trimEnd().split("\n").length;
  return overBudgetLadder({
    full: output,
    replacement: () => `${lineCount} lines (over budget)`,
  });
}

export const psqlHandler = defineHandler({
  name: "psql",
  traits: { ladder: true },
  programs: ["psql"],

  match(command: ParsedCommand) {
    return command.program === "psql";
  },

  format: (raw: RawResult, _command, options: TkOptions) => {
    // RTK: cloud/psql_cmd.rs::run uses RunOptions::stdout_only() — only stdout is
    // filtered. tk's rawText merges stdout+stderr; on the success path stderr is
    // empty, matching RTK. The filter operates on the merged raw text.
    const { text, omission } = filterPsqlOutput(rawText(raw));
    return { output: text, omission };
  },
});
