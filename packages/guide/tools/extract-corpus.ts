// Corpus extractor CLI (`pnpm gen`): real store (READ-ONLY) -> public/generated/corpus.json.
//
// The SQL projection + pure mapper now live in ./corpus-source.ts and
// ./corpus-mapper.ts, reused verbatim by `ctx guide` (packages/cli, slice 5b).
// This file is only the file-writing CLI wrapper.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { extractCorpusFromDb } from "./corpus-source.js";

// Re-export the pure mapper + shared extraction surface so `tools/extract-corpus`
// stays the public entry named in the 5a work order.
export { assertScrubbed, buildCorpus, parsePath } from "./corpus-mapper.js";
export type {
  ExtractInput,
  RawCommitRow,
  RawFileRow,
  RawLinkRow,
  RawSymRow,
} from "./corpus-mapper.js";
export {
  DEFAULT_DISCLOSURES,
  EVENT_COMMIT_WINDOW,
  emptyCorpus,
  extractCorpusFromDb,
  extractCorpusReadOnly,
  type ExtractCorpusOptions,
} from "./corpus-source.js";

const DEFAULT_STORE = "/Users/ziyu/.contexa/projects/9cd2e7eab8b4/store.sqlite";
const DEFAULT_OUT = "public/generated/corpus.json";

function parseArgs(argv: string[]): { store: string; out: string; diff?: string } {
  const args = { store: DEFAULT_STORE, out: DEFAULT_OUT } as {
    store: string;
    out: string;
    diff?: string;
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--store") args.store = argv[++i]!;
    else if (argv[i] === "--out") args.out = argv[++i]!;
    else if (argv[i] === "--diff") args.diff = argv[++i]!;
  }
  return args;
}

function main(): void {
  const { store, out, diff } = parseArgs(process.argv.slice(2));
  const db = new DatabaseSync(store, { readOnly: true });
  const corpus = extractCorpusFromDb(db, { repo: "token-killer", diff });
  db.close();

  const outPath = resolve(process.cwd(), out);
  mkdirSync(dirname(outPath), { recursive: true });
  const json = JSON.stringify(corpus);
  writeFileSync(outPath, json, "utf8");

  const bytes = Buffer.byteLength(json, "utf8");
  const g = corpus.generations;
  process.stdout.write(
    [
      `corpus written: ${outPath}`,
      `  bytes:         ${bytes} (${(bytes / 1024).toFixed(1)} KiB)`,
      `  repo:          ${corpus.repo} @ ${corpus.sourceRevision.slice(0, 12)}`,
      `  generations:   code=${g.code} git=${g.git} docs=${g.docs} memory=${g.memory}`,
      `  files:         ${corpus.files.length}`,
      `  decls:         ${corpus.files.reduce((n, f) => n + f.declCount, 0)}`,
      `  calls:         ${corpus.edges.calls.length}`,
      `  imports:       ${corpus.edges.imports.length}`,
      `  event:         ${corpus.event.label}`,
      `  event anchors: ${corpus.event.anchorFiles.length} files / ${corpus.event.anchorSyms.length} syms`,
      "",
    ].join("\n"),
  );
}

const isMain =
  process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
