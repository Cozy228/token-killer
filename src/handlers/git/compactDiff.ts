import type { OmissionDeclaration } from "../../types.js";
import { overBudgetLadder, withinBudget } from "../common/budget.js";

type DiffLine = { kind: "hunk" | "change" | "context"; text: string };
type DiffFileBlock = { file: string; added: number; removed: number; lines: DiffLine[] };

// Parse a unified diff into per-file blocks. Index/mode/`---`/`+++` header lines
// and `\ No newline` markers are noise and dropped (noise-removal, not omission);
// every `@@` hunk header and every +/- changed line is kept.
function parseUnifiedDiff(diff: string): DiffFileBlock[] {
  const files: DiffFileBlock[] = [];
  let current: DiffFileBlock | undefined;
  let inHunk = false;

  for (const line of diff.split(/\r?\n/)) {
    if (line.startsWith("diff --git")) {
      current = {
        file: line.split(" b/")[1] ?? line.replace("diff --git ", ""),
        added: 0,
        removed: 0,
        lines: [],
      };
      files.push(current);
      inHunk = false;
      continue;
    }
    if (!current) continue;

    if (line.startsWith("@@")) {
      inHunk = true;
      current.lines.push({ kind: "hunk", text: line });
      continue;
    }
    if (!inHunk) continue;

    if (line.startsWith("+") && !line.startsWith("+++")) {
      current.added += 1;
      current.lines.push({ kind: "change", text: line });
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      current.removed += 1;
      current.lines.push({ kind: "change", text: line });
    } else if (!line.startsWith("\\")) {
      current.lines.push({ kind: "context", text: line });
    }
  }

  return files;
}

// Full / step-1 digest rendering. The digest drops unchanged CONTEXT lines but
// keeps every `@@` header and every +/- changed line — diff hunks are
// location-class, so the changed lines (the evidence) are NEVER dropped.
function renderBlocks(files: DiffFileBlock[], opts: { context: boolean }): string {
  const out: string[] = [];
  for (const file of files) {
    out.push("", file.file);
    for (const line of file.lines) {
      if (line.kind === "context" && !opts.context) continue;
      out.push(`  ${line.text}`);
    }
    if (file.added > 0 || file.removed > 0) out.push(`  +${file.added} -${file.removed}`);
  }
  return out.join("\n").trimStart();
}

// Step-2 complete-replacement summary: per-file `+added -removed` only, no hunks.
// On a very large changeset even the per-file list can exceed the budget, so it
// falls back to a single repo-wide total (still an honest aggregate + the snapshot
// pointer the gate appends).
function renderSummary(files: DiffFileBlock[]): string {
  const changed = files.filter((file) => file.added > 0 || file.removed > 0);
  const perFile = changed.map((file) => `${file.file}  +${file.added} -${file.removed}`).join("\n");
  if (withinBudget(perFile)) return perFile;
  const added = changed.reduce((sum, file) => sum + file.added, 0);
  const removed = changed.reduce((sum, file) => sum + file.removed, 0);
  return `${changed.length} files changed (+${added} -${removed})`;
}

// ADR 0001 finding #6: diff hunks are location-class and are never capped. The
// old fixed `maxHunkLines=100` / 500-line hard-stop (which dropped unique changed
// lines) and the banned `tk --raw` recovery pointer are removed. Below the token
// budget the full condensed diff is emitted; over budget step 1 drops context
// (keeps every changed line); if still over, step 2 is a per-file count summary.
// The recovery snapshot pointer is appended by makeFilteredResult.
export function compactUnifiedDiff(diff: string): {
  text: string;
  omission?: OmissionDeclaration;
} {
  const files = parseUnifiedDiff(diff);
  const ladder = overBudgetLadder({
    full: renderBlocks(files, { context: true }),
    digest: () => renderBlocks(files, { context: false }),
    replacement: () => renderSummary(files),
  });
  return { text: ladder.text, omission: ladder.omission };
}

export function extractDiffStatLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .filter((line) => /\|\s+\d+/.test(line) || /\d+ files? changed/.test(line));
}
