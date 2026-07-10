/**
 * e0-init-ground-truth — generate the E0 retrieval-benchmark ground-truth SKELETON
 * (MEASUREMENT-DESIGN-V2 §1b).
 *
 * Reads the task bank and emits, per task, a skeleton row the MAINTAINER then
 * fills in by hand:
 *
 *   {
 *     "task": "...", "repo": "...",
 *     "queries": [ { "q": "<task prompt>", "mode": "task" } ],
 *     "expected": { "files": [], "decisions": [] },
 *     "gates_note": "TBD by maintainer"
 *   }
 *
 * ANTI-LEAK (Q17 discipline, §1b): this script PROPOSES query text from the bank
 * prompt only. It NEVER auto-fills `expected` from the fix commit's touched files —
 * that would leak the answer into the benchmark. The maintainer authors
 * `expected.files` / `expected.decisions` and the relevance/gate thresholds by hand,
 * before any benchmark run, reading ONLY the real fix commit.
 *
 * Usage:
 *   tsx e0-init-ground-truth.ts --bank <task-bank.jsonl> --out <ground-truth.jsonl>
 *       [--force]
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { readJsonl, writeJsonl } from "./lib.ts";

interface BankRow {
  task: string;
  repo: string;
  prompt: string;
}

interface GroundTruthSkeleton {
  task: string;
  repo: string;
  queries: { q: string; mode: "task" }[];
  expected: { files: string[]; decisions: string[] };
  gates_note: string;
}

function flags(argv: string[]): Record<string, string> {
  const f: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a.startsWith("--"))
      f[a.slice(2)] =
        argv[i + 1] && !argv[i + 1]!.startsWith("--") ? (argv[++i] as string) : "true";
  }
  return f;
}

function main(): number {
  const f = flags(process.argv.slice(2));
  if (!f.bank || !f.out) {
    console.error(
      "usage: tsx e0-init-ground-truth.ts --bank <task-bank.jsonl> --out <ground-truth.jsonl> [--force]",
    );
    return 2;
  }
  const bankPath = resolve(f.bank);
  const outPath = resolve(f.out);
  if (existsSync(outPath) && !f.force) {
    console.error(
      `refusing to overwrite existing ${outPath} (would clobber maintainer-authored ` +
        `expected-hit sets). Pass --force only if you are sure it is still a skeleton.`,
    );
    return 1;
  }
  const bank = readJsonl<BankRow>(bankPath);
  if (bank.length === 0) {
    console.error(`bank has no rows: ${bankPath}`);
    return 1;
  }
  const skeletons: GroundTruthSkeleton[] = bank.map((row) => ({
    task: row.task,
    repo: row.repo,
    // One proposed query per task: the task prompt as a `task`-mode context query.
    // The maintainer may add 1-2 drill-down queries per task using returned handles
    // after a first probe (§1b), but those handles do not exist until a run.
    queries: [{ q: row.prompt.trim(), mode: "task" }],
    // ANTI-LEAK: left EMPTY on purpose. Maintainer fills from the real fix commit.
    expected: { files: [], decisions: [] },
    gates_note: "TBD by maintainer",
  }));
  writeJsonl(outPath, skeletons);
  console.log(`wrote ${skeletons.length} ground-truth skeleton row(s) → ${outPath}`);
  console.log(
    "NEXT (maintainer, before any E0 run): fill each row's expected.files (the fix commit's\n" +
      "touched files) + expected.decisions (governing decision ids), and set the per-repo\n" +
      "relevance floor in gates_note. Do NOT auto-fill from git — author by hand (Q17 anti-leak).",
  );
  return 0;
}

process.exitCode = main();
