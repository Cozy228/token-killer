// Shared, node-only corpus extraction (SQL rows -> CorpusInput). Read-only.
//
// This is the ONE place the store schema is projected into the Atlas corpus:
//   - `pnpm gen` (tools/extract-corpus.ts) calls it to write public/generated/corpus.json.
//   - `ctx guide` (packages/cli, slice 5b) calls it in-process AFTER the R10
//     startup refresh catch-up, to serve GET /api/corpus.
// The PURE mapper (buildCorpus + scrub guard) lives in ./corpus-mapper.ts and is
// reused verbatim by both — the SQL projection is NOT forked (5b work order).
//
// Guarantees:
//   - Opens the store with { readOnly: true }; SELECT only; never writes.
//   - `buildCorpus` runs `assertScrubbed`, so no absolute path / homedir leaks.

import { DatabaseSync } from "node:sqlite";
import {
  buildCorpus,
  commitEpoch,
  type ExtractInput,
  type RawCommitRow,
  type RawFileRow,
  type RawLinkRow,
  type RawSymRow,
} from "./corpus-mapper.js";
import type { CorpusInput } from "../src/atlas/types.js";

export type { CorpusInput } from "../src/atlas/types.js";

/** Default window of most-recent commits used as the cold `#/` diff event. */
export const EVENT_COMMIT_WINDOW = 20;

/** Standing corpus-scope disclosures (D25 honest-gap). */
export const DEFAULT_DISCLOSURES: readonly string[] = [
  "spike corpus: co-changed and references edges are excluded to keep the payload lean (D25 event-evidence layer, not backbone)",
  "touches are scoped to the event commit range only; full commit history is not carried",
  "symbols are the only decl atoms; local definitions and raw syntax nodes are not Atlas atoms (D7)",
];

export interface ExtractCorpusOptions {
  /** Repo display name (project-relative, never a path). */
  repo: string;
  /** `<from>..<to>` short-hex range to override the default recent-window event. */
  diff?: string;
  /** Most-recent-commit window for the default event (default EVENT_COMMIT_WINDOW). */
  eventWindow?: number;
  /** Extra disclosures appended to the standing set (e.g. startup-staleness). */
  extraDisclosures?: readonly string[];
}

function shortHex(commitId: string): string {
  return commitId.replace(/^commit:/, "");
}

/**
 * Project an OPEN read-only store connection into a CorpusInput. The caller owns
 * the connection lifecycle. Never writes.
 */
export function extractCorpusFromDb(db: DatabaseSync, opts: ExtractCorpusOptions): CorpusInput {
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

  const eventWindow = opts.eventWindow ?? EVENT_COMMIT_WINDOW;
  let eventCommitIds: string[];
  let eventRange: { from: string; to: string };
  let eventLabel: string;
  if (opts.diff) {
    const [from, to] = opts.diff.split("..");
    eventRange = { from: from ?? "", to: to ?? "" };
    eventCommitIds = commits
      .map((c) => c.id)
      .filter((id) => shortHex(id) === from || shortHex(id) === to);
    eventLabel = `diff ${from}..${to}`;
  } else if (sortedCommits.length > 0) {
    const window = sortedCommits.slice(0, eventWindow);
    eventCommitIds = window.map((c) => c.id);
    const newest = window[0]!;
    const oldest = window[window.length - 1]!;
    eventRange = { from: shortHex(oldest.id), to: shortHex(newest.id) };
    eventLabel = `latest ${window.length} commits ${eventRange.from}..${eventRange.to}`;
  } else {
    eventCommitIds = [];
    eventRange = { from: "", to: "" };
    eventLabel = "no commit history";
  }

  const disclosures = [...DEFAULT_DISCLOSURES, ...(opts.extraDisclosures ?? [])];

  const input: ExtractInput = {
    repo: opts.repo,
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
  };
  return buildCorpus(input);
}

/** Open the store STRICTLY read-only, project it, and close. Never writes. */
export function extractCorpusReadOnly(dbPath: string, opts: ExtractCorpusOptions): CorpusInput {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    return extractCorpusFromDb(db, opts);
  } finally {
    db.close();
  }
}

/**
 * A well-formed CorpusInput signalling "no indexed corpus" (files: []). The
 * frontend renders StateScreen `empty` (names `ctx sync`) on files.length === 0
 * — the flag is wired through the payload, the screen is not duplicated.
 */
export function emptyCorpus(repo: string, extraDisclosures: readonly string[] = []): CorpusInput {
  return {
    schemaVersion: 1,
    repo,
    sourceRevision: "",
    generations: { code: 0, git: 0, docs: 0, memory: 0 },
    files: [],
    edges: { calls: [], imports: [], touches: [] },
    event: {
      kind: "diff",
      label: "no indexed corpus",
      range: { from: "", to: "" },
      commitIds: [],
      anchorFiles: [],
      anchorSyms: [],
    },
    disclosures: ["no indexed corpus — run `ctx sync` to build the store", ...extraDisclosures],
  };
}
