// Corpus extractor runtime: real store (READ-ONLY) -> public/generated/corpus.json.
//
// Guarantees:
//   - Opens the store with { readOnly: true }; SELECT only; never writes.
//   - Pure mapping + scrub live in ./corpus-mapper.ts (tested without sqlite).
//   - co-changed / references are intentionally NOT in the spike corpus (kept
//     lean, D25) and disclosed.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildCorpus,
  commitEpoch,
  type RawCommitRow,
  type RawFileRow,
  type RawLinkRow,
  type RawSymRow,
} from "./corpus-mapper.js";

// Re-export the pure mapper surface so `tools/extract-corpus` stays the public
// entry named in the work order.
export { assertScrubbed, buildCorpus, parsePath } from "./corpus-mapper.js";
export type {
  ExtractInput,
  RawCommitRow,
  RawFileRow,
  RawLinkRow,
  RawSymRow,
} from "./corpus-mapper.js";

const DEFAULT_STORE = "/Users/ziyu/.contexa/projects/9cd2e7eab8b4/store.sqlite";
const DEFAULT_OUT = "public/generated/corpus.json";
const EVENT_COMMIT_WINDOW = 20;

function parseArgs(argv: string[]): { store: string; out: string; diff?: string } {
  const args = { store: DEFAULT_STORE, out: DEFAULT_OUT } as {
    store: string;
    out: string;
    diff?: string;
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--store") args.store = argv[++i];
    else if (argv[i] === "--out") args.out = argv[++i];
    else if (argv[i] === "--diff") args.diff = argv[++i];
  }
  return args;
}

function shortHex(commitId: string): string {
  return commitId.replace(/^commit:/, "");
}

function main(): void {
  const { store, out, diff } = parseArgs(process.argv.slice(2));
  const db = new DatabaseSync(store, { readOnly: true });

  const files = db
    .prepare("SELECT id, locator FROM entities WHERE kind = 'file'")
    .all() as unknown as RawFileRow[];
  const symbols = db
    .prepare("SELECT id, name, attrs, locator FROM entities WHERE kind = 'symbol'")
    .all() as unknown as RawSymRow[];
  const commits = db
    .prepare("SELECT id, attrs FROM entities WHERE kind = 'commit'")
    .all() as unknown as RawCommitRow[];
  const contains = db
    .prepare("SELECT src, dst, claim_id FROM links WHERE predicate = 'contains'")
    .all() as unknown as RawLinkRow[];
  const calls = db
    .prepare("SELECT src, dst, claim_id FROM links WHERE predicate = 'calls'")
    .all() as unknown as RawLinkRow[];
  const imports = db
    .prepare("SELECT src, dst, claim_id FROM links WHERE predicate = 'imports'")
    .all() as unknown as RawLinkRow[];
  const allTouches = db
    .prepare("SELECT src, dst, claim_id FROM links WHERE predicate = 'touches'")
    .all() as unknown as RawLinkRow[];

  const genRows = db.prepare("SELECT source, published_gen FROM generations").all() as Array<{
    source: string;
    published_gen: number;
  }>;
  const genMap = new Map(genRows.map((g) => [g.source, g.published_gen]));
  const generations = {
    code: genMap.get("code") ?? 0,
    git: genMap.get("git") ?? 0,
    docs: genMap.get("docs") ?? 0,
    memory: genMap.get("memory") ?? 0,
  };

  const openConf = db.prepare("SELECT a, b FROM conflicts WHERE status = 'open'").all() as Array<{
    a: number;
    b: number;
  }>;
  const claimIds = new Set<number>();
  for (const c of openConf) {
    claimIds.add(c.a);
    claimIds.add(c.b);
  }
  const conflictEntityIds: string[] = [];
  for (const id of claimIds) {
    const row = db.prepare("SELECT subject FROM claims WHERE id = ?").get(id) as
      | { subject: string }
      | undefined;
    if (row) conflictEntityIds.push(row.subject);
  }

  const anchorRows = db.prepare("SELECT entity_id FROM anchors").all() as Array<{
    entity_id: string;
  }>;
  const needsReviewAnchorEntityIds = anchorRows.map((r) => r.entity_id);

  const gitCursor = db.prepare("SELECT position FROM cursors WHERE source = 'git'").get() as
    | { position: string }
    | undefined;
  const sortedCommits = [...commits]
    .map((c) => ({ id: c.id, date: commitEpoch(c.attrs) ?? 0 }))
    .sort((a, b) => b.date - a.date);
  const sourceRevision = gitCursor?.position ?? shortHex(sortedCommits[0]?.id ?? "");

  let eventCommitIds: string[];
  let eventRange: { from: string; to: string };
  let eventLabel: string;
  if (diff) {
    const [from, to] = diff.split("..");
    eventRange = { from, to };
    eventCommitIds = commits
      .map((c) => c.id)
      .filter((id) => shortHex(id) === from || shortHex(id) === to);
    eventLabel = `diff ${from}..${to}`;
  } else {
    const window = sortedCommits.slice(0, EVENT_COMMIT_WINDOW);
    eventCommitIds = window.map((c) => c.id);
    const newest = window[0];
    const oldest = window[window.length - 1];
    eventRange = { from: shortHex(oldest.id), to: shortHex(newest.id) };
    eventLabel = `latest ${window.length} commits ${eventRange.from}..${eventRange.to}`;
  }

  const disclosures = [
    "spike corpus: co-changed and references edges are excluded to keep the payload lean (D25 event-evidence layer, not backbone)",
    "touches are scoped to the event commit range only; full commit history is not carried",
    "symbols are the only decl atoms; local definitions and raw syntax nodes are not Atlas atoms (D7)",
  ];

  const corpus = buildCorpus({
    repo: "token-killer",
    sourceRevision,
    generations,
    files,
    symbols,
    contains,
    calls,
    imports,
    commits,
    allTouches,
    eventCommitIds,
    eventRange,
    eventLabel,
    openConflictEntityIds: conflictEntityIds,
    needsReviewAnchorEntityIds,
    disclosures,
  });

  db.close();

  const outPath = resolve(process.cwd(), out);
  mkdirSync(dirname(outPath), { recursive: true });
  const json = JSON.stringify(corpus);
  writeFileSync(outPath, json, "utf8");

  const bytes = Buffer.byteLength(json, "utf8");
  process.stdout.write(
    [
      `corpus written: ${outPath}`,
      `  bytes:         ${bytes} (${(bytes / 1024).toFixed(1)} KiB)`,
      `  repo:          ${corpus.repo} @ ${corpus.sourceRevision.slice(0, 12)}`,
      `  generations:   code=${generations.code} git=${generations.git} docs=${generations.docs} memory=${generations.memory}`,
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
