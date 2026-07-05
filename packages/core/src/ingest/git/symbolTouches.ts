/**
 * Symbol-level `touches` + symbol rename chains (CTX-IMPL §5.1, slice 2b).
 *
 * Upgrades the git source's file-level `touches` to SYMBOL level. For each
 * commit×code-file the diff modifies, the `--unified=0` post-image hunk ranges
 * are range-overlap-joined against the symbols of that file's POST-IMAGE
 * (re-parsed from `<oid>:<path>` with the same 2a extractor) → a
 * `commit --touches--> sym:` link per overlapped symbol.
 *
 * Re-parsing the post-image (rather than joining historical hunks against the
 * HEAD spans the code source persists) is what makes a deep commit's edge
 * CORRECT: a symbol's id is span-free (§3/G-9), so the id parsed from an old
 * post-image is the same id the code source persisted for HEAD — but the SPANS
 * used for the join are that commit's, not HEAD's (their line numbers differ).
 * The two batched git calls that feed it (`git cat-file --batch` for blobs,
 * `git diff-tree --stdin` for hunks) keep the whole full-history pass to a
 * handful of spawns.
 *
 * Fallback (1d behaviour, kept): a code file whose changes hit no symbol
 * (imports / top-level only, or a file that extracts nothing) and every non-code
 * file / deletion take the file-level `commit --touches--> file:` link. A
 * symbol-bearing hit never ALSO emits a file-level touch — no double-count.
 *
 * Rename chains (F1 / B2-history): a git-detected code-file rename maps
 * pre-image symbols (`<oid>^:<oldPath>`) to post-image symbols by qualified
 * name → a `sym:old --renamed-to--> sym:new` link, so the old id's `touches`
 * history stays reachable from the new id. Renames are links, never id mutation.
 */
import type { Store } from "../../store/store.ts";
import { languageForPath } from "../../extract/code/languages.ts";
import type { LanguageId } from "../../extract/code/languages.ts";
import type { ExtractResult, SymbolRecord } from "../../extract/code/symbol.ts";
import type { CommitRecord } from "./walk.ts";
import { catFileBatch, diffTreeStdin } from "./gitCli.ts";
import { hunkHitsSpan, parseDiffTreeStream, type DiffHunk, type FileDiff } from "./diffHunks.ts";

/** Re-parse a post/pre-image blob into symbols (the 2a extractor, in-process). */
export type ParseFn = (
  relPath: string,
  content: string,
  lang: LanguageId,
) => Promise<ExtractResult>;

function commitId(oid12: string): string {
  return `commit:${oid12}`;
}
function fileId(path: string): string {
  return `file:${path}`;
}

/**
 * Emit symbol-level `touches` (+ file-level fallback + symbol rename chains) for
 * a batch of commits. Returns the number of claims appended (links are upserts).
 * Idempotent: a commit that already carries any `touches` link is skipped, so a
 * re-walked / crash-resumed batch never double-appends.
 */
export async function emitSymbolTouches(
  store: Store,
  root: string,
  commits: CommitRecord[],
  gen: number,
  parse: ParseFn,
): Promise<number> {
  const pending = commits.filter((c) => store.linksFrom(commitId(c.oid12), "touches").length === 0);
  if (pending.length === 0) return 0;

  // One cat-file --batch (post-images + rename pre-images) and one diff-tree
  // --stdin (hunks) for the whole batch — never a spawn per file.
  const blobSpecs: string[] = [];
  for (const c of pending) {
    for (const f of c.files) {
      if (f.status !== "D" && languageForPath(f.path)) blobSpecs.push(`${c.oid}:${f.path}`);
      if ((f.status === "R" || f.status === "C") && f.oldPath && languageForPath(f.oldPath)) {
        blobSpecs.push(`${c.oid}^:${f.oldPath}`);
      }
    }
  }
  const blobs = catFileBatch(root, blobSpecs);
  const hunkMap = parseDiffTreeStream(
    diffTreeStdin(
      root,
      pending.map((c) => c.oid),
    ),
  );

  // Parse each fetched blob at most once (span source is span-free by id).
  const symCache = new Map<string, SymbolRecord[]>();
  const parseSpec = async (spec: string, path: string): Promise<SymbolRecord[]> => {
    const cached = symCache.get(spec);
    if (cached) return cached;
    const content = blobs.get(spec);
    const lang = languageForPath(path);
    let symbols: SymbolRecord[] = [];
    if (content !== undefined && lang) {
      try {
        symbols = (await parse(path, content, lang)).symbols;
      } catch {
        symbols = []; // a bad post-image degrades to file-level, never crashes the run
      }
    }
    symCache.set(spec, symbols);
    return symbols;
  };

  let claims = 0;
  for (const c of pending) {
    const cid = commitId(c.oid12);
    const perFile = fileHunkIndex(hunkMap.get(c.oid));
    for (const f of c.files) {
      // Symbol rename chain first (so a resume that sees `touches` also has renames).
      if ((f.status === "R" || f.status === "C") && f.oldPath && languageForPath(f.oldPath)) {
        claims += await emitRenameChain(store, c, f.oldPath, f.path, f.score, gen, parseSpec);
      }
      if (f.status !== "D" && languageForPath(f.path)) {
        const symbols = await parseSpec(`${c.oid}:${f.path}`, f.path);
        const hunks = perFile.get(f.path) ?? [];
        const hits = symbols.filter((s) => hunks.some((h) => hunkHitsSpan(h, s.span)));
        if (hits.length > 0) {
          for (const s of hits) claims += emitTouch(store, cid, s.id, c.oid, "derived", gen);
        } else {
          claims += emitTouch(store, cid, fileId(f.path), c.oid, "observed", gen); // fallback
        }
      } else {
        claims += emitTouch(store, cid, fileId(f.path), c.oid, "observed", gen); // non-code / deletion
      }
    }
  }
  return claims;
}

function emitTouch(
  store: Store,
  cid: string,
  dst: string,
  oid: string,
  authority: "observed" | "derived",
  gen: number,
): number {
  const claimId = store.addClaim({
    subject: cid,
    predicate: "touches",
    object: dst,
    carrier: "git",
    locus: oid,
    method: "structural",
    authority,
    gen,
  });
  store.setLink({
    src: cid,
    dst,
    predicate: "touches",
    method: "structural",
    confidence: 1.0,
    claimId,
  });
  return 1;
}

/** Map pre-image symbols to post-image symbols by qualified name → rename links. */
async function emitRenameChain(
  store: Store,
  commit: CommitRecord,
  oldPath: string,
  newPath: string,
  score: number | undefined,
  gen: number,
  parseSpec: (spec: string, path: string) => Promise<SymbolRecord[]>,
): Promise<number> {
  const preSyms = await parseSpec(`${commit.oid}^:${oldPath}`, oldPath);
  const postSyms = await parseSpec(`${commit.oid}:${newPath}`, newPath);
  if (preSyms.length === 0 || postSyms.length === 0) return 0;
  const postByQualified = new Map(postSyms.map((s) => [s.qualified, s]));
  let claims = 0;
  for (const pre of preSyms) {
    const post = postByQualified.get(pre.qualified);
    if (!post || post.id === pre.id) continue; // same id → nothing to bridge
    const claimId = store.addClaim({
      subject: pre.id,
      predicate: "renamed-to",
      object: post.id,
      carrier: "git",
      locus: `${commit.oid}:${score ?? ""}`,
      method: "rename-tracked",
      authority: "derived",
      gen,
    });
    store.setLink({
      src: pre.id,
      dst: post.id,
      predicate: "renamed-to",
      method: "rename-tracked",
      confidence: (score ?? 100) / 100,
      claimId,
    });
    claims++;
  }
  return claims;
}

/** Collapse a commit's `FileDiff[]` into `path → hunks` for the overlap join. */
function fileHunkIndex(diffs: FileDiff[] | undefined): Map<string, DiffHunk[]> {
  const index = new Map<string, DiffHunk[]>();
  for (const d of diffs ?? []) {
    const existing = index.get(d.filePath);
    if (existing) existing.push(...d.hunks);
    else index.set(d.filePath, [...d.hunks]);
  }
  return index;
}
