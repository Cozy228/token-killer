// Deterministic 10x expansion of a CorpusInput (D12 merge-blocking budget input).
// PURE: no Date.now / Math.random. Cross-clone edges use a seeded mulberry32 PRNG.
//
// The original input is clone 0 (unprefixed, so the event anchors stay valid).
// Nine extra clones live under synthetic-01/ .. synthetic-09/. 10x is NEVER
// precomputed into corpus.json — it is built on demand from the loaded corpus.

import type { CorpusEdge, CorpusFile, CorpusInput } from "./types.js";

const CLONE_SEED = 0x5eed10a5;
const CROSS_CLONE_IMPORTS = 200;
const EXTRA_CLONES = 9;

/** Seeded, deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function prefixPath(prefix: string, path: string): string {
  return `${prefix}/${path}`;
}
function prefixFileId(prefix: string, id: string): string {
  return `file:${prefix}/${id.slice("file:".length)}`;
}
function prefixSymId(prefix: string, id: string): string {
  const body = id.slice("sym:".length);
  return `sym:${prefix}/${body}`;
}

function cloneFile(prefix: string, f: CorpusFile): CorpusFile {
  return {
    path: prefixPath(prefix, f.path),
    declCount: f.declCount,
    status: f.status,
    recency: f.recency,
    decls: f.decls.map((d) => ({
      id: prefixSymId(prefix, d.id),
      name: d.name,
      kind: d.kind,
      order: d.order,
    })),
  };
}

function cloneCallEdge(prefix: string, e: CorpusEdge): CorpusEdge {
  return {
    src: prefixSymId(prefix, e.src),
    dst: prefixSymId(prefix, e.dst),
    count: e.count,
    claimId: e.claimId,
  };
}
function cloneImportEdge(prefix: string, e: CorpusEdge): CorpusEdge {
  return {
    src: prefixFileId(prefix, e.src),
    dst: prefixFileId(prefix, e.dst),
    count: e.count,
    claimId: e.claimId,
  };
}

export function expand10x(input: CorpusInput): CorpusInput {
  const files: CorpusFile[] = [...input.files];
  const calls: CorpusEdge[] = [...input.edges.calls];
  const imports: CorpusEdge[] = [...input.edges.imports];

  const prefixes: string[] = [];
  for (let i = 1; i <= EXTRA_CLONES; i++) prefixes.push(`synthetic-${String(i).padStart(2, "0")}`);

  for (const prefix of prefixes) {
    for (const f of input.files) files.push(cloneFile(prefix, f));
    for (const e of input.edges.calls) calls.push(cloneCallEdge(prefix, e));
    for (const e of input.edges.imports) imports.push(cloneImportEdge(prefix, e));
  }

  // Seeded cross-clone import edges between file ids across all 10 clones.
  const allFileIds = files.map((f) => `file:${f.path}`);
  const rnd = mulberry32(CLONE_SEED);
  for (let i = 0; i < CROSS_CLONE_IMPORTS && allFileIds.length > 1; i++) {
    const a = Math.floor(rnd() * allFileIds.length);
    let b = Math.floor(rnd() * allFileIds.length);
    if (b === a) b = (b + 1) % allFileIds.length;
    imports.push({ src: allFileIds[a], dst: allFileIds[b], count: 1, claimId: null });
  }

  return {
    ...input,
    files,
    edges: { calls, imports, touches: input.edges.touches },
    disclosures: [
      ...input.disclosures,
      `synthetic 10x: ${EXTRA_CLONES} extra clones + ${CROSS_CLONE_IMPORTS} seeded cross-clone imports`,
    ],
  };
}
