/**
 * Git source adapter (CTX-IMPL §4 SourceAdapter, §5.1 extractor rules).
 *
 * Lands (§9 slice 1d): a `git` cursor, commit entities (locator {t:'git',oid} —
 * message read back on demand, never stored), file-level `touches`, rename
 * chains (`rename-tracked`), trailers / issue keys (`explicit-key` claims), and
 * co-change links. Orchestrated by the refresh engine; `ctx sync` drives it.
 *
 * Identity: `commit:<oid12>`, `file:<repo-rel-path>` (§3). Git runs against the
 * CURRENT checkout root (`store.projectRoot`) so read-through of the same oids
 * resolves from the same checkout; the shard is common-dir keyed so worktrees of
 * one repo still share a store (§3).
 *
 * Resumability without outer transactions: the Store API exposes entity/claim/
 * link writers (autocommit) plus self-transacting `ftsIndex`/generation ops, but
 * no way to wrap several writes in one caller transaction. Atomicity is therefore
 * per-statement; idempotency across a budget-interrupted resume (or a re-run) is
 * guaranteed by a commit-entity existence guard — an already-ingested commit oid
 * is skipped, so no `touches`/reference claim is ever double-appended. The cursor
 * is an optimisation on top of that guard, advanced per batch.
 */
import type { Store } from "../../store/store.ts";
import type { Budget, DirtyReport, IngestResult, SourceAdapter } from "../adapter.ts";
import { GitError, headOid, revListCount } from "./gitCli.ts";
import { walkCommits, walkWindow, type CommitRecord } from "./walk.ts";
import {
  computeCochange,
  DEFAULT_COCHANGE_WINDOW,
  COCHANGE_MIN_SUPPORT,
  type CochangeOptions,
} from "./cochange.ts";
import { parseReferences } from "./trailers.ts";
import { emitSymbolTouches } from "./symbolTouches.ts";
// Type-only: the tree-sitter runtime (web-tree-sitter WASM) is dynamically
// imported inside ingest ONLY when symbol-level touches are on, so the bare
// git-only path never eagerly loads a grammar engine it will not use.
import type { CodeParserCore } from "../../extract/code/runtime.ts";

const SOURCE = "git" as const;
/** Commit subject stored as the entity `name` (a label, like a file's path);
 *  the message body is never stored — read back via the git locator. */
const SUBJECT_NAME_CAP = 500;
/** Cursor-advance + budget-check cadence (§5.1 "batch 200 commits"). */
const BATCH = 200;

export interface GitAdapterOptions {
  /** Co-change sliding window in commits (default 500, §5.1). */
  cochangeWindow?: number;
  /** Minimum pair support for a co-change link (default 3). */
  cochangeMinSupport?: number;
  /** Relative ingest cost hint for cheapest-first ordering (§4.3). */
  cost?: number;
  /** Cursor-advance + budget-check cadence (default 200, §5.1). Test seam. */
  batchSize?: number;
  /**
   * Emit SYMBOL-level `touches` by re-parsing each commit×code-file post-image
   * and joining `--unified=0` hunks against its symbol spans (slice 2b). When
   * off (default), `touches` stay file-level (1d behaviour) — the bare adapter
   * is code-source-free, so M1 unit fixtures never pull the WASM engine.
   * `createDefaultRegistry` opts this on (it always registers the code source),
   * so real serve gets symbol biography without every caller remembering to.
   */
  symbolTouches?: boolean;
}

function commitId(oid12: string): string {
  return `commit:${oid12}`;
}
function fileId(path: string): string {
  return `file:${path}`;
}

export class GitAdapter implements SourceAdapter {
  readonly id = SOURCE;
  readonly cost: number;
  readonly #cochangeWindow: number;
  readonly #cochangeMinSupport: number;
  readonly #batchSize: number;
  readonly #symbolTouches: boolean;

  constructor(opts: GitAdapterOptions = {}) {
    this.cost = opts.cost ?? 2; // git walk is heavier than a memory scan, lighter than a full doc scan
    this.#cochangeWindow = opts.cochangeWindow ?? DEFAULT_COCHANGE_WINDOW;
    this.#cochangeMinSupport = opts.cochangeMinSupport ?? COCHANGE_MIN_SUPPORT;
    this.#batchSize = Math.max(1, opts.batchSize ?? BATCH);
    this.#symbolTouches = opts.symbolTouches ?? false;
  }

  /**
   * dirtyCheck = `git rev-list --count <storedTip>..HEAD` — a COUNT, not a
   * boolean (§4.2), so policy can differ for 1 vs 500 commits behind. Target
   * <20ms warm; short-circuits to clean when the stored tip equals HEAD
   * (A4-immutable).
   */
  async dirtyCheck(store: Store): Promise<DirtyReport> {
    const root = store.projectRoot;
    const head = headOid(root);
    if (head === undefined) {
      return { source: SOURCE, dirty: false, magnitude: 0 }; // unborn HEAD / empty repo
    }
    const cursor = store.getCursor(SOURCE);
    const tip = cursor?.position;
    if (tip === head) return { source: SOURCE, dirty: false, magnitude: 0 };
    let magnitude: number;
    try {
      magnitude = revListCount(root, tip);
    } catch (err) {
      // Stored tip no longer exists (history rewrite) → full re-ingest.
      if (err instanceof GitError && err.code === "bad-revision") {
        magnitude = revListCount(root, undefined);
      } else {
        throw err;
      }
    }
    return { source: SOURCE, dirty: magnitude > 0, magnitude, detail: { head, tip } };
  }

  async ingest(store: Store, _dirty: DirtyReport, budget: Budget): Promise<IngestResult> {
    const root = store.projectRoot;
    const head = headOid(root);
    if (head === undefined) return { source: SOURCE, complete: true, entities: 0, claims: 0 };

    const cursor = store.getCursor(SOURCE);
    let since = cursor?.position;
    let commits: CommitRecord[];
    try {
      commits = walkCommits(root, since);
    } catch (err) {
      if (err instanceof GitError && err.code === "bad-revision") {
        since = undefined; // rewritten history — walk from the root
        commits = walkCommits(root, undefined);
      } else {
        throw err;
      }
    }

    const gen = store.beginGeneration(SOURCE);
    const fileSeen = new Set<string>();
    let entities = 0;
    let claims = 0;
    let complete = true;
    let processedTip = since;

    // Symbol-level touches re-parse each post-image with the 2a extractor; a
    // single in-process core is reused across batches (bulk historical parsing,
    // not the live worker-isolated path) and always disposed. The runtime loads
    // lazily so the file-level-only path never pulls in the WASM engine.
    let core: CodeParserCore | null = null;
    if (this.#symbolTouches) {
      const { CodeParserCore: Core } = await import("../../extract/code/runtime.ts");
      core = new Core();
    }
    try {
      for (let start = 0; start < commits.length; start += this.#batchSize) {
        if (budget.now() >= budget.deadline) {
          complete = false;
          break;
        }
        const batch = commits.slice(start, start + this.#batchSize);
        for (const commit of batch) {
          const counts = this.#writeCommit(store, commit, gen, fileSeen);
          entities += counts.entities;
          claims += counts.claims;
        }
        // Symbol-level touches for the batch (phase 2): runs before the cursor
        // advances so a completed batch always has its touches (§2b resumability).
        if (core) {
          claims += await emitSymbolTouches(store, root, batch, gen, (p, c, l) =>
            core.parse(p, c, l),
          );
        }
        processedTip = batch[batch.length - 1]!.oid;
        // Advance the cursor so a resume re-walks only the remainder; the
        // per-commit guard makes any overlap a no-op regardless.
        store.setCursor(SOURCE, processedTip, budget.now(), gen);
      }
    } finally {
      core?.dispose();
    }

    if (!complete) {
      // Partial: leave the generation unpublished (rows stay invisible until a
      // later refresh finishes the range and recomputes co-change).
      return { source: SOURCE, complete: false, entities, claims };
    }

    // Co-change is a whole-window statistic — recompute only once the range is
    // fully in (§5.1: window recomputed when new commits arrive, O(window)).
    claims += this.#recomputeCochange(store, gen);
    store.setCursor(SOURCE, head, budget.now(), gen);
    store.publishGeneration(SOURCE);
    return { source: SOURCE, complete: true, entities, claims };
  }

  #writeCommit(
    store: Store,
    commit: CommitRecord,
    gen: number,
    fileSeen: Set<string>,
  ): { entities: number; claims: number } {
    const cid = commitId(commit.oid12);
    // Idempotency guard: an already-ingested commit is skipped wholesale, so no
    // append-only claim is ever duplicated on resume / re-run.
    if (store.getEntity(cid) !== undefined) return { entities: 0, claims: 0 };

    let entities = 0;
    let claims = 0;

    store.upsertEntity({
      id: cid,
      kind: "commit",
      name: commit.subject.slice(0, SUBJECT_NAME_CAP),
      locator: { t: "git", oid: commit.oid },
      sourceRev: commit.oid,
      attrs: { author: commit.author, authorEmail: commit.authorEmail, date: commit.date },
      gen,
    });
    entities++;
    // Contentless FTS: subject + body are INDEXED (searchable), never stored.
    store.ftsIndex(cid, {
      name: commit.subject,
      text: commit.body ? `${commit.subject}\n${commit.body}` : commit.subject,
      kind: "commit",
    });

    for (const f of commit.files) {
      const fid = fileId(f.path);
      entities += this.#ensureFileEntity(store, f.path, gen, fileSeen);
      // touches: commit → post-image file (Observed direct from the diff). When
      // symbol-level touches are on, the touch is emitted by the phase-2 pass
      // (symbol-level for symbol-bearing files, file-level fallback otherwise) —
      // so it is deferred here to avoid a double-counted file+symbol touch.
      if (!this.#symbolTouches) {
        const touchClaim = store.addClaim({
          subject: cid,
          predicate: "touches",
          object: fid,
          carrier: "git",
          locus: `${commit.oid}:${f.status}`,
          method: "structural",
          authority: "observed",
          gen,
        });
        claims++;
        store.setLink({
          src: cid,
          dst: fid,
          predicate: "touches",
          method: "structural",
          confidence: 1.0,
          claimId: touchClaim,
        });
      }

      if ((f.status === "R" || f.status === "C") && f.oldPath !== undefined) {
        const oldFid = fileId(f.oldPath);
        entities += this.#ensureFileEntity(store, f.oldPath, gen, fileSeen);
        // Rename chain: old → new preserves history continuity across the
        // path-based `file:` identity (§5.1).
        const renameClaim = store.addClaim({
          subject: oldFid,
          predicate: "renamed-to",
          object: fid,
          carrier: "git",
          locus: `${commit.oid}:${f.status}${f.score ?? ""}`,
          method: "rename-tracked",
          authority: "observed",
          gen,
        });
        claims++;
        store.setLink({
          src: oldFid,
          dst: fid,
          predicate: "renamed-to",
          method: "rename-tracked",
          confidence: (f.score ?? 100) / 100,
          claimId: renameClaim,
        });
      }
    }

    // Trailers & issue keys → explicit-key claims on the commit (Observed).
    for (const ref of parseReferences(commit.subject, commit.body)) {
      store.addClaim({
        subject: cid,
        predicate: ref.kind,
        object: ref.target,
        carrier: "git",
        locus: commit.oid,
        method: "explicit-key",
        authority: "observed",
        gen,
      });
      claims++;
    }

    return { entities, claims };
  }

  #ensureFileEntity(store: Store, path: string, gen: number, fileSeen: Set<string>): number {
    if (fileSeen.has(path)) return 0;
    fileSeen.add(path);
    store.upsertEntity({
      id: fileId(path),
      kind: "file",
      name: path,
      locator: { t: "file", path },
      gen,
    });
    return 1;
  }

  #recomputeCochange(store: Store, gen: number): number {
    const window = walkWindow(store.projectRoot, this.#cochangeWindow);
    const opts: CochangeOptions = { minSupport: this.#cochangeMinSupport };
    const pairs = computeCochange(window, opts);
    let claims = 0;
    for (const pair of pairs) {
      const src = fileId(pair.src);
      const dst = fileId(pair.dst);
      // Both endpoints must be known file entities (they will be — every windowed
      // commit was ingested). Support lives in the claim locus; the link carries
      // the confidence (selection reads links, provenance reads the claim).
      const claimId = store.addClaim({
        subject: src,
        predicate: "co-changed",
        object: dst,
        carrier: "git",
        locus: `support=${pair.support};window=${this.#cochangeWindow}`,
        method: "structural",
        authority: "derived",
        gen,
      });
      claims++;
      store.setLink({
        src,
        dst,
        predicate: "co-changed",
        method: "structural",
        confidence: pair.confidence,
        claimId,
      });
    }
    return claims;
  }
}

export function createGitAdapter(opts?: GitAdapterOptions): SourceAdapter {
  return new GitAdapter(opts);
}
