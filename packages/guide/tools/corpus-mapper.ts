// Pure row-to-corpus mapper (no I/O, no node:sqlite) so it is testable under
// the vitest/happy-dom environment. The sqlite runtime lives in
// extract-corpus.ts and imports from here.

import type {
  CorpusEdge,
  CorpusFile,
  CorpusInput,
  CorpusTouch,
  NodeStatus,
} from "../src/atlas/types.js";

export interface RawFileRow {
  id: string;
  locator: string;
}
export interface RawSymRow {
  id: string;
  name: string;
  attrs: string;
  locator: string;
}
export interface RawLinkRow {
  src: string;
  dst: string;
  claim_id: number | null;
}
export interface RawCommitRow {
  id: string;
  attrs: string;
}

export interface ExtractInput {
  repo: string;
  sourceRevision: string;
  generations: { code: number; git: number; docs: number; memory: number };
  files: RawFileRow[];
  symbols: RawSymRow[];
  contains: RawLinkRow[]; // file -> sym
  calls: RawLinkRow[]; // sym -> sym
  imports: RawLinkRow[]; // file -> file
  commits: RawCommitRow[];
  allTouches: RawLinkRow[]; // commit -> file|sym (ALL, for recency)
  eventCommitIds: string[];
  eventRange: { from: string; to: string };
  eventLabel: string;
  openConflictEntityIds: string[];
  needsReviewAnchorEntityIds: string[];
  disclosures: string[];
}

export function parsePath(locator: string): string {
  try {
    const loc = JSON.parse(locator);
    if (loc && typeof loc.path === "string") return loc.path;
  } catch {
    /* fall through */
  }
  return "";
}

function spanStart(locator: string): number {
  try {
    const loc = JSON.parse(locator);
    if (loc && Array.isArray(loc.span) && typeof loc.span[0] === "number") return loc.span[0];
  } catch {
    /* fall through */
  }
  return 0;
}

function symKind(attrs: string): string {
  try {
    const a = JSON.parse(attrs);
    if (a && typeof a.symbolKind === "string") return a.symbolKind;
  } catch {
    /* fall through */
  }
  return "symbol";
}

export function commitEpoch(attrs: string): number | null {
  try {
    const a = JSON.parse(attrs);
    if (a && typeof a.date === "string") {
      const t = Date.parse(a.date);
      return Number.isNaN(t) ? null : t;
    }
  } catch {
    /* fall through */
  }
  return null;
}

function aggregateEdges(links: RawLinkRow[]): CorpusEdge[] {
  interface Agg {
    src: string;
    dst: string;
    count: number;
    claimId: number | null;
    claimIds: Set<number>;
  }
  const map = new Map<string, Agg>();
  for (const l of links) {
    if (l.src === l.dst) continue;
    const key = `${l.src} ${l.dst}`;
    let cur = map.get(key);
    if (!cur) {
      cur = { src: l.src, dst: l.dst, count: 0, claimId: l.claim_id, claimIds: new Set<number>() };
      map.set(key, cur);
    }
    cur.count += 1;
    // D33 aggregate trust: collect EVERY distinct backing claim id (SQL dedup),
    // not just the first — `claimId` stays as the first for wire back-compat.
    if (l.claim_id !== null) cur.claimIds.add(l.claim_id);
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...map.values()]
    .sort((a, b) => cmp(a.src, b.src) || cmp(a.dst, b.dst))
    .map((a) => ({
      src: a.src,
      dst: a.dst,
      count: a.count,
      claimId: a.claimId,
      claimIds: [...a.claimIds].sort((x, y) => x - y),
    }));
}

/** Throws if the corpus would leak an absolute path, homedir, or username. */
export function assertScrubbed(corpus: CorpusInput): void {
  const json = JSON.stringify(corpus);
  const forbidden: Array<[RegExp, string]> = [
    [/\/Users\//, "macOS home path"],
    [/\/home\//, "linux home path"],
    [/[A-Za-z]:\\\\/, "windows drive path"],
    [/\/root\//, "root home path"],
  ];
  for (const [re, label] of forbidden) {
    const m = json.match(re);
    if (m) throw new Error(`scrub violation (${label}): corpus contains "${m[0]}"`);
  }
  for (const f of corpus.files) {
    if (f.path.startsWith("/")) throw new Error(`scrub violation: absolute file path "${f.path}"`);
  }
}

export function buildCorpus(input: ExtractInput): CorpusInput {
  const conflictIds = new Set(input.openConflictEntityIds);
  const needsReviewIds = new Set(input.needsReviewAnchorEntityIds);

  const symById = new Map(input.symbols.map((s) => [s.id, s]));
  const declsByFile = new Map<
    string,
    Array<{ id: string; name: string; kind: string; start: number }>
  >();
  for (const link of input.contains) {
    const sym = symById.get(link.dst);
    if (!sym) continue;
    const list = declsByFile.get(link.src) ?? [];
    list.push({
      id: sym.id,
      name: sym.name,
      kind: symKind(sym.attrs),
      start: spanStart(sym.locator),
    });
    declsByFile.set(link.src, list);
  }

  const commitDate = new Map<string, number>();
  for (const c of input.commits) {
    const e = commitEpoch(c.attrs);
    if (e !== null) commitDate.set(c.id, e);
  }
  const recency = new Map<string, number>();
  for (const t of input.allTouches) {
    if (!t.dst.startsWith("file:")) continue;
    const d = commitDate.get(t.src);
    if (d === undefined) continue;
    const cur = recency.get(t.dst);
    if (cur === undefined || d > cur) recency.set(t.dst, d);
  }

  const files: CorpusFile[] = input.files.map((f) => {
    const id = f.id;
    const path = parsePath(f.locator) || id.replace(/^file:/, "");
    const rawDecls = (declsByFile.get(id) ?? []).sort(
      (a, b) => a.start - b.start || (a.id < b.id ? -1 : 1),
    );
    const decls = rawDecls.map((d, i) => ({ id: d.id, name: d.name, kind: d.kind, order: i }));
    let status: NodeStatus = "active";
    if (conflictIds.has(id)) status = "conflict";
    else if (needsReviewIds.has(id)) status = "needs-review";
    return { path, declCount: decls.length, decls, status, recency: recency.get(id) ?? null };
  });
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const eventCommits = new Set(input.eventCommitIds);
  const touches: CorpusTouch[] = [];
  const anchorFiles = new Set<string>();
  const anchorSyms = new Set<string>();
  for (const t of input.allTouches) {
    if (!eventCommits.has(t.src)) continue;
    touches.push({ commit: t.src, target: t.dst });
    if (t.dst.startsWith("file:")) anchorFiles.add(t.dst);
    else if (t.dst.startsWith("sym:")) anchorSyms.add(t.dst);
  }
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  touches.sort((a, b) => cmp(a.commit, b.commit) || cmp(a.target, b.target));

  const corpus: CorpusInput = {
    schemaVersion: 1,
    repo: input.repo,
    sourceRevision: input.sourceRevision,
    generations: input.generations,
    files,
    edges: {
      calls: aggregateEdges(input.calls),
      imports: aggregateEdges(input.imports),
      touches,
    },
    event: {
      kind: "diff",
      label: input.eventLabel,
      range: input.eventRange,
      commitIds: [...input.eventCommitIds].sort(cmp),
      anchorFiles: [...anchorFiles].sort(cmp),
      anchorSyms: [...anchorSyms].sort(cmp),
    },
    disclosures: input.disclosures,
  };

  assertScrubbed(corpus);
  return corpus;
}
