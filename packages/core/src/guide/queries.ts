/**
 * Store queries the guide needs and core did not have.
 *
 * `symbolsInFile` and `filesInCommit` are pure store reads. `diffForCommits` is the one
 * that is NOT a store read at all: diff hunks are NOT persisted (only the `touches` links
 * they produced are), so the Change Trace has to RE-DERIVE them from git through the
 * existing `gitCli` / `diffHunks` helpers. That is deliberate — index-not-copy: the store
 * points at git, it does not duplicate it.
 *
 * All three are non-mutating.
 */
import { diffTreeStdin } from "../ingest/git/gitCli.ts";
import { parseDiffTreeStream, type FileDiff } from "../ingest/git/diffHunks.ts";
import type { Entity } from "../store/types.ts";
import type { Store } from "../store/store.ts";

/**
 * The code ingest's own manifest of every file it saw at the published generation.
 *
 * THE LIVENESS ORACLE FOR LOTS. It lives in `cursors.position` for `source='code'` — a JSON
 * `{ files: { "<repo-rel-path>": { size, mtimeMs, hash, fp } } }` — not in `links`, which is
 * why looking only at link predicates missed it. Each entry carries a content hash, so this
 * is provenance-carrying EVIDENCE, not an inference. It is a store row, so the kernel never
 * has to stat the filesystem (export and snapshot must work with no checkout present).
 *
 * This is the ONE seam that reads the cursor JSON. If the ingest ever promotes this fact into
 * a real table, only this function changes.
 *
 * Validated against the real filesystem over all 1,406 file entities: 591 in-manifest and on
 * disk, 309 absent from both, and ZERO in-manifest-but-absent — no false positive, so no ghost
 * can survive it. The 506 on-disk-but-not-in-manifest are non-code files (`.gitignore`,
 * `.github/workflows/*`, `.husky/*`) that the code ingest deliberately does not index; D5 rules
 * the canvas renders the CODE structure graph only, so they were never Atlas lots. They stay
 * reachable through search and Subject.
 *
 * FRESHNESS: if the generation identity is mismatched (the generation trap), this manifest is
 * stale along with every other row — which is coherent, and the `live | snapshot | stale` badge
 * is what discloses it. There is deliberately NO second freshness mechanism for lots.
 */
export interface LiveCodeFile {
  path: string;
  hash: string;
  size: number;
}

export function liveCodeFiles(store: Store): Map<string, LiveCodeFile> {
  const live = new Map<string, LiveCodeFile>();
  const position = store.getCursor("code")?.position;
  if (position === undefined) return live; // code never ingested -> no lots, honestly

  const manifest = JSON.parse(position) as {
    files?: Record<string, { size?: number; hash?: string }>;
  };
  for (const [path, entry] of Object.entries(manifest.files ?? {})) {
    live.set(path, { path, hash: entry.hash ?? "", size: entry.size ?? 0 });
  }
  return live;
}

/**
 * Declarations a file CURRENTLY contains, in source order.
 *
 * Strictly the `contains` links. A symbol whose locator still names this file but which no
 * `contains` link reaches is RETIRED — it no longer exists here, and the file's path may
 * even have been taken over by a new, unrelated file. Unioning the locator scan back in
 * would smuggle those ghosts through the query surface and straight onto the map.
 */
export function symbolsInFile(store: Store, fileId: string): Entity[] {
  const symbols: Entity[] = [];
  for (const link of store.linksFrom(fileId, "contains")) {
    const entity = store.getEntity(link.dst);
    if (entity?.kind === "symbol") symbols.push(entity);
  }
  return symbols.sort((a, b) => spanStart(a) - spanStart(b) || cmp(a.id, b.id));
}

/**
 * Symbols the store still holds for a file that it no longer `contains` — reachable so
 * rename chains and anchor repair keep working (D20), never rendered.
 */
export function retiredSymbolsOf(store: Store, fileId: string): Entity[] {
  const path = fileId.startsWith("file:") ? fileId.slice(5) : fileId;
  const contained = new Set(store.linksFrom(fileId, "contains").map((l) => l.dst));
  return store
    .entitiesByKind("symbol")
    .filter(
      (e) => e.locator.t === "file" && e.locator.path === path && !contained.has(e.id),
    )
    .sort((a, b) => cmp(a.id, b.id));
}

/** Files and declarations a commit touched (the `touches` links it produced). */
export function filesInCommit(
  store: Store,
  commitId: string,
): { files: string[]; declarations: string[] } {
  const files: string[] = [];
  const declarations: string[] = [];
  for (const link of store.linksFrom(commitId, "touches")) {
    if (link.dst.startsWith("file:")) files.push(link.dst);
    else if (link.dst.startsWith("sym:")) declarations.push(link.dst);
  }
  return { files: files.sort(), declarations: declarations.sort() };
}

/**
 * Re-derive per-commit diff hunks from git. NOT a store read — the hunks were never
 * persisted. One `git diff-tree --stdin` process for the whole batch.
 *
 * The commit ENTITY ID carries an abbreviated oid (`commit:ab651c5c95cc`), but
 * `parseDiffTreeStream` keys on the bare 40-hex marker git prints per commit, so an
 * abbreviated oid on stdin yields a stream nothing matches. The full oid lives on the
 * entity's git locator — use that, and map the result back onto the caller's own keys.
 */
export function diffForCommits(store: Store, commitIds: readonly string[]): Map<string, FileDiff[]> {
  const fullOid = new Map<string, string>();
  for (const id of commitIds) {
    const locator = store.getEntity(id)?.locator;
    if (locator?.t === "git") fullOid.set(id, locator.oid);
    else if (id.startsWith("commit:")) fullOid.set(id, id.slice(7));
    else fullOid.set(id, id);
  }
  if (fullOid.size === 0) return new Map();

  const parsed = parseDiffTreeStream(diffTreeStdin(store.projectRoot, [...fullOid.values()]));

  const byCaller = new Map<string, FileDiff[]>();
  for (const [id, oid] of fullOid) {
    const hit = parsed.get(oid);
    if (hit) byCaller.set(id, hit);
  }
  return byCaller;
}

function spanStart(entity: Entity): number {
  return entity.locator.t === "file" && entity.locator.span ? entity.locator.span[0] : 0;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
