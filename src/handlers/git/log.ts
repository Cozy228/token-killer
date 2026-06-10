import type { OmissionDeclaration, ParsedCommand } from "../../types.js";
import { defineHandler } from "../define.js";
import { overBudgetLadder } from "../common/budget.js";

type Commit = {
  hash: string;
  author?: string;
  date?: string;
  subject?: string;
};

function shortHash(hash: string): string {
  return hash.slice(0, 12);
}

const ONELINE_HEADER = /^[0-9a-f]{7,40}\s+\S/;

// H6: flags whose presence means the output contains rich content that our
// reformatter cannot losslessly handle — pass through raw in that case.
const RICH_OUTPUT_FLAGS = new Set([
  "-p",
  "--patch",
  "--stat",
  "--name-status",
  "--name-only",
  "--show-signature",
  "--format",
  "--pretty",
]);

function hasRichOutputFlag(command: ParsedCommand): boolean {
  return command.args.some(
    (a) => RICH_OUTPUT_FLAGS.has(a) || a.startsWith("--format=") || a.startsWith("--pretty="),
  );
}

// RTK: git.rs::filter_log_output — for the oneline/pretty log, each hash-prefixed line
// starts a new commit; the lines beneath it are body. Keep up to 3 non-trailer body
// lines indented under their commit, dropping Signed-off-by / Co-authored-by trailers.
//
// M20-log: the old undeclared `[+N lines omitted]` body cap trips the base omission
// sniffer and reverts to raw (0% savings). Replaced with an ADR 0001 declared
// over-budget ladder: full text → header-only digest (no bodies) → replacement count.
function formatOnelineLog(text: string): { output: string; omission?: OmissionDeclaration } {
  // Step: strip trailers and build the full per-commit output (header + up to 3 body
  // lines per commit). This is the "full" representation for the ladder.
  const fullLines: string[] = [];
  // Digest: header lines only (no body), for when the full output is over budget.
  const digestLines: string[] = [];
  let bodyCount = 0;
  let commitCount = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (ONELINE_HEADER.test(line)) {
      fullLines.push(line);
      digestLines.push(line);
      bodyCount = 0;
      commitCount += 1;
      continue;
    }
    if (line.startsWith("Signed-off-by:") || line.startsWith("Co-authored-by:")) continue;
    if (fullLines.length === 0) continue; // body before any header — ignore
    if (bodyCount < 3) {
      fullLines.push(`  ${line}`);
      bodyCount += 1;
    }
    // M20-log: excess body lines are dropped silently in the "full" tier (RTK
    // keeps only 3 body lines); no `[+N lines omitted]` marker is ever emitted.
    // The declared ladder handles over-budget reduction transparently.
  }

  const full = `${fullLines.join("\n")}\n`;
  const ladder = overBudgetLadder({
    full,
    digest: () => `${digestLines.join("\n")}\n`,
    replacement: () => `git log: ${commitCount} commits\n`,
  });
  return { output: ladder.text, omission: ladder.omission };
}

function formatLog(text: string): { output: string; omission?: OmissionDeclaration } {
  const rawLines = text.split(/\r?\n/).filter(Boolean);
  if (rawLines.length === 0) return { output: "Git Log\nCommits: 0\n" };

  // Oneline/pretty log (hash-prefixed headers, optional body) — not the verbose
  // "commit <hash>" form, which the block parser below handles.
  const firstLine = rawLines[0] ?? "";
  if (ONELINE_HEADER.test(firstLine) && !firstLine.startsWith("commit ")) {
    return formatOnelineLog(text);
  }

  const commits: Commit[] = [];
  let current: Commit | undefined;
  let expectingSubject = false;

  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("commit ")) {
      current = { hash: line.replace("commit ", "").trim() };
      commits.push(current);
      expectingSubject = false;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("Author:")) {
      current.author = line.replace("Author:", "").trim();
      continue;
    }
    if (line.startsWith("Date:")) {
      current.date = line.replace("Date:", "").trim();
      expectingSubject = true;
      continue;
    }
    if (expectingSubject && line.startsWith("    ") && line.trim()) {
      current.subject = line.trim();
      expectingSubject = false;
    }
  }

  if (commits.length === 0) {
    return { output: text.endsWith("\n") ? text : `${text}\n` };
  }

  if (commits.length <= 1) {
    return { output: text.endsWith("\n") ? text : `${text}\n` };
  }

  const lines = [`Git Log: ${commits.length} commits`, ""];
  for (const commit of commits) {
    const meta = [commit.author, commit.date].filter(Boolean).join(" | ");
    lines.push(`${shortHash(commit.hash)} ${commit.subject ?? "(no subject)"}`);
    if (meta) lines.push(`  ${meta}`);
  }
  const full = `${lines.join("\n")}\n`;
  // Apply the budget ladder to the verbose block-form log as well.
  const ladder = overBudgetLadder({
    full,
    digest: () => {
      const headerOnly = [`Git Log: ${commits.length} commits`, ""];
      for (const commit of commits) {
        headerOnly.push(`${shortHash(commit.hash)} ${commit.subject ?? "(no subject)"}`);
      }
      return `${headerOnly.join("\n")}\n`;
    },
    replacement: () => `Git Log: ${commits.length} commits\n`,
  });
  return { output: ladder.text, omission: ladder.omission };
}

export const gitLogHandler = defineHandler({
  name: "git-log",
  traits: { cacheable: true, ttlClass: "slow" },
  programs: ["git"],

  match(command) {
    return command.program === "git" && command.args[0] === "log";
  },

  format(raw, command, _options) {
    // H6: rich output flags mean the log contains diffs, stat, signatures, or
    // user-defined format — our reformatter cannot losslessly handle them.
    // Pass through raw to preserve the content faithfully.
    if (hasRichOutputFlag(command)) {
      const text = raw.stdout || raw.stderr;
      return { output: text.endsWith("\n") ? text : `${text}\n` };
    }
    const { output, omission } = formatLog(raw.stdout || raw.stderr);
    return { output, omission };
  },
});
