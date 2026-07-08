/**
 * Parse `git log -z -M --name-status` into structured commit records
 * (CONTEXA-IMPL §5.1). The message body is parsed transiently for trailers/keys and
 * FTS indexing — it is never persisted (index-not-copy, P25①); the commit
 * entity's locator is `{t:'git',oid}` and the message is read back on demand.
 *
 * Framing (chosen to survive arbitrary path/message bytes under `-z`):
 *   \x01  record start (one per commit)
 *   \x1f  header field separator
 *   \x02  end-of-header marker; the NUL-delimited name-status block follows
 * Control chars \x01/\x02/\x1f do not occur in git identities, subjects, ISO
 * dates or paths, so the split is unambiguous for real histories.
 */
import { rawLog } from "./gitCli.ts";

export const REC = "\x01";
export const US = "\x1f";
export const EOH = "\x02";

/** git log --format placeholders, in header order. */
export const LOG_FORMAT = `${REC}%H${US}%an${US}%ae${US}%aI${US}%s${US}%b${EOH}`;

export type FileChangeStatus = "A" | "M" | "D" | "T" | "R" | "C";

export interface FileChange {
  status: FileChangeStatus;
  /** Post-image path (the file's path AFTER this commit); the entity identity. */
  path: string;
  /** Pre-image path for renames/copies (R/C). */
  oldPath?: string;
  /** Similarity score 0–100 for renames/copies (R082 → 82). */
  score?: number;
}

export interface CommitRecord {
  oid: string; // full 40-hex
  oid12: string; // first 12 (entity key, §3)
  author: string;
  authorEmail: string;
  date: string; // author date, ISO-8601 strict
  subject: string;
  body: string;
  files: FileChange[];
}

const STATUS_TWO_PATH = new Set(["R", "C"]);

function parseNameStatus(block: string): FileChange[] {
  // git separates the commit header from the -z name-status block with a NUL
  // (the commit terminator) followed by a newline; skip both so the first
  // status token isn't corrupted (e.g. "\nR100"). Real paths never lead with
  // either character, so this is safe.
  let s = 0;
  while (s < block.length && (block[s] === "\n" || block[s] === "\0")) s++;
  const tokens = block
    .slice(s)
    .split("\0")
    .filter((t) => t.length > 0);
  const files: FileChange[] = [];
  for (let i = 0; i < tokens.length;) {
    const raw = tokens[i]!;
    const letter = raw[0] as FileChangeStatus;
    if (STATUS_TWO_PATH.has(letter)) {
      const oldPath = tokens[i + 1];
      const newPath = tokens[i + 2];
      if (oldPath === undefined || newPath === undefined) break; // truncated tail
      files.push({
        status: letter,
        path: newPath,
        oldPath,
        score: Number.parseInt(raw.slice(1), 10) || 0,
      });
      i += 3;
    } else {
      const path = tokens[i + 1];
      if (path === undefined) break;
      files.push({ status: letter, path });
      i += 2;
    }
  }
  return files;
}

/** Parse the raw `git log` output produced with LOG_FORMAT + `-z --name-status`. */
export function parseLog(raw: string): CommitRecord[] {
  const commits: CommitRecord[] = [];
  for (const part of raw.split(REC)) {
    if (part.length === 0) continue; // pre-first-record remainder
    const eoh = part.indexOf(EOH);
    if (eoh === -1) continue;
    const header = part.slice(0, eoh);
    const nameStatus = part.slice(eoh + 1);
    const [oid, author, authorEmail, date, subject, body] = header.split(US);
    if (!oid) continue;
    commits.push({
      oid,
      oid12: oid.slice(0, 12),
      author: author ?? "",
      authorEmail: authorEmail ?? "",
      date: date ?? "",
      subject: subject ?? "",
      body: body ?? "",
      files: parseNameStatus(nameStatus),
    });
  }
  return commits;
}

/**
 * Walk commits in `since..HEAD` (or the full history when `since` is undefined),
 * returned OLDEST-FIRST so the cursor can advance monotonically for resumable
 * ingest (§4). Rename/copy detection is on (-M).
 */
export function walkCommits(root: string, since: string | undefined): CommitRecord[] {
  const range = since === undefined ? "HEAD" : `${since}..HEAD`;
  const raw = rawLog(root, ["-M", "-z", "--name-status", `--format=${LOG_FORMAT}`, range]);
  // git log is reverse-chronological; reverse to oldest-first.
  return parseLog(raw).reverse();
}

/**
 * Walk the co-change window: the last `windowCommits` commits from HEAD
 * (CONTEXA-IMPL §5.1 default 500). Order is irrelevant to pair counting.
 */
export function walkWindow(root: string, windowCommits: number): CommitRecord[] {
  const raw = rawLog(root, [
    "-M",
    "-z",
    "--name-status",
    `--format=${LOG_FORMAT}`,
    `-n`,
    String(windowCommits),
    "HEAD",
  ]);
  return parseLog(raw);
}
