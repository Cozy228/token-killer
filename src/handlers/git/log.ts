import { defineHandler } from "../define.js";

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

// RTK: git.rs::filter_log_output — for the oneline/pretty log, each hash-prefixed line
// starts a new commit; the lines beneath it are body. Keep up to 3 non-trailer body
// lines indented under their commit, dropping Signed-off-by / Co-authored-by trailers.
function formatOnelineLog(text: string): string {
  const out: string[] = [];
  let bodyCount = 0;
  let omitted = 0;

  const flushOmitted = () => {
    if (omitted > 0) out.push(`  [+${omitted} lines omitted]`);
    omitted = 0;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    if (ONELINE_HEADER.test(line)) {
      flushOmitted();
      out.push(line);
      bodyCount = 0;
      continue;
    }
    if (line.startsWith("Signed-off-by:") || line.startsWith("Co-authored-by:")) continue;
    if (out.length === 0) continue; // body before any header — ignore
    if (bodyCount < 3) {
      out.push(`  ${line}`);
      bodyCount += 1;
    } else {
      omitted += 1;
    }
  }
  flushOmitted();

  return `${out.join("\n")}\n`;
}

function formatLog(text: string): string {
  const rawLines = text.split(/\r?\n/).filter(Boolean);
  if (rawLines.length === 0) return "Git Log\nCommits: 0\n";

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
    return text.endsWith("\n") ? text : `${text}\n`;
  }

  if (commits.length <= 1) return text.endsWith("\n") ? text : `${text}\n`;

  const lines = [`Git Log: ${commits.length} commits`, ""];
  for (const commit of commits) {
    const meta = [commit.author, commit.date].filter(Boolean).join(" | ");
    lines.push(`${shortHash(commit.hash)} ${commit.subject ?? "(no subject)"}`);
    if (meta) lines.push(`  ${meta}`);
  }
  return `${lines.join("\n")}\n`;
}

export const gitLogHandler = defineHandler({
  name: "git-log",
  traits: { cacheable: true, ttlClass: "slow" },
  programs: ["git"],

  match(command) {
    return command.program === "git" && command.args[0] === "log";
  },

  format(raw, _command, _options) {
    return formatLog(raw.stdout || raw.stderr);
  },
});
