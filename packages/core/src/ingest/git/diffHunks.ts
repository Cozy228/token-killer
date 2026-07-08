/**
 * Unified-diff hunk parsing for symbol-level `touches` (CONTEXA-IMPL §5.1, slice 2b).
 *
 * Lifts gitnexus's `parseDiffHunks` (reference:
 * `.research/gitnexus/gitnexus/src/storage/git.ts`): extract the POST-image
 * (`+` side) line ranges from `@@` headers under each `+++ b/<path>`. A
 * `--unified=0` diff makes those ranges the exact changed lines, so a
 * range-overlap join against a symbol's span answers "did this commit touch
 * this symbol?" without re-deriving line movement.
 *
 * `parseDiffTreeStream` splits a `git diff-tree --stdin -p` stream into one
 * `FileDiff[]` per commit: git prints a bare 40-hex oid line before each
 * commit's patch, and diff content lines are always prefixed (`+`/`-`/space),
 * so a bare-oid line is an unambiguous section marker.
 */

/** A 1-based inclusive post-image line range from a `@@` header. */
export interface DiffHunk {
  startLine: number;
  endLine: number;
}

/** Per-file post-image hunk ranges parsed out of a unified diff. */
export interface FileDiff {
  /** Post-image path (from `+++ b/<path>`), repo-relative, quotepath-off. */
  filePath: string;
  hunks: DiffHunk[];
}

/** `@@ -<old> +<start>[,<count>] @@` — capture the post-image start + count. */
const HUNK_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
/** A bare full-oid line: the per-commit section marker in `diff-tree --stdin`
 *  (tolerate a trailing CR so a CRLF-normalising checkout can't split blind). */
const OID_LINE_RE = /^[0-9a-f]{40}\r?$/;

/** True when a post-image hunk overlaps a 1-based inclusive `[start,end]` span. */
export function hunkHitsSpan(hunk: DiffHunk, span: readonly [number, number]): boolean {
  return hunk.startLine <= span[1] && span[0] <= hunk.endLine;
}

/**
 * Parse one unified diff (with `-U0`) into per-file post-image hunk ranges.
 * Pure-deletion hunks (post-image count 0) contribute no range (lift: gitnexus).
 */
export function parseDiffHunks(diffOutput: string): FileDiff[] {
  const files: FileDiff[] = [];
  let current: FileDiff | undefined;
  for (const line of diffOutput.split("\n")) {
    current = consumeDiffLine(line, files, current);
  }
  return files;
}

/**
 * Split a `git diff-tree --stdin -p` stream into `commit-oid → FileDiff[]`. Each
 * commit's patch starts at a bare 40-hex oid line; the file/hunk lines until the
 * next such marker belong to that commit.
 */
export function parseDiffTreeStream(output: string): Map<string, FileDiff[]> {
  const byCommit = new Map<string, FileDiff[]>();
  let files: FileDiff[] | undefined;
  let current: FileDiff | undefined;
  for (const line of output.split("\n")) {
    if (OID_LINE_RE.test(line)) {
      files = [];
      byCommit.set(line, files);
      current = undefined;
      continue;
    }
    if (files === undefined) continue; // preamble before the first commit marker
    current = consumeDiffLine(line, files, current);
  }
  return byCommit;
}

/** Advance the file/hunk parse for one diff line; returns the new "current file". */
function consumeDiffLine(
  line: string,
  files: FileDiff[],
  current: FileDiff | undefined,
): FileDiff | undefined {
  if (line.startsWith("+++ b/")) {
    const next: FileDiff = { filePath: line.slice(6).replace(/\r$/, ""), hunks: [] };
    files.push(next);
    return next;
  }
  if (current && line.startsWith("@@")) {
    const m = HUNK_RE.exec(line);
    if (m) {
      const start = Number.parseInt(m[1]!, 10);
      const count = m[2] !== undefined ? Number.parseInt(m[2], 10) : 1;
      if (count > 0) current.hunks.push({ startLine: start, endLine: start + count - 1 });
    }
  }
  return current;
}
