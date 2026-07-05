/**
 * Code source adapter (CTX-IMPL §4 SourceAdapter, §5.2 code structure) — slice
 * 2a foundation + slice 2c fingerprint invalidation & incremental correctness.
 *
 * 2a lands: tree-sitter symbol entities (spans + per-symbol content_hash) for
 * the 7 tier-1 languages, a respawnable parse worker, a (size,mtime)+hash dirty
 * scan honoring .gitignore, and file→symbol `contains` links.
 *
 * 2c adds, on that foundation:
 *  - STRUCTURAL FINGERPRINT — a content-hash mismatch is classified COSMETIC
 *    (reformat/comment-only: hash updated, ALL downstream re-linking /
 *    invalidation skipped, memory anchors untouched) vs STRUCTURAL (full
 *    re-extract + cascade). Unknown/first-sight → STRUCTURAL (conservative).
 *  - MEMORY-ANCHOR DRIFT — a signature/body change to an anchored symbol flags
 *    the memory `needs-review`, reason-classed `signature-changed`/`body-changed`.
 *  - INCREMENTAL TRIO — 1-hop boundary expansion (re-ingest the unchanged side of
 *    every `imports` edge crossing the changed set), shadow detection (a new file
 *    that can steal a resolution re-resolves the pre-existing importers), and a
 *    shrink guard (a pass whose symbol graph collapses without observed deletions
 *    refuses to publish; the success-shaped report discloses it).
 *
 * Identity (§3): `file:<path>` contains `sym:<path>#<qualified>[~<disambig>]`.
 * Spans/hashes are attributes, never identity (G-9); span text via `node.text`
 * only (G-8).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Store } from "../../store/store.ts";
import { blake2bHex } from "../../store/hash.ts";
import type { Budget, DirtyReport, IngestResult, SourceAdapter } from "../adapter.ts";
import { scanSourceFiles, type ScannedFile } from "../scan.ts";
import { CodeParser } from "../../extract/code/codeParser.ts";
import { CODE_EXTENSIONS, languageForPath, type LanguageId } from "../../extract/code/languages.ts";
import type { ExtractResult, SymbolRecord } from "../../extract/code/symbol.ts";
import { classifyContentChange, structuralFingerprint } from "./fingerprint.ts";
import {
  buildModuleIndex,
  expandBoundary,
  expandShadow,
  fileEntityId,
  flagAnchorDrift,
  readPrevSymbols,
  resolveImport,
  shrinkGuard,
  type PrevSymbol,
} from "./incremental.ts";
import {
  buildCalleeIndex,
  enclosingSymbol,
  resolveCallee,
  type IndexedSymbol,
} from "./callGraph.ts";
import { runScipPass, type ScipPassResult } from "./scip/consume.ts";

const SOURCE = "code" as const;

interface FileState {
  size: number;
  mtimeMs: number;
  hash: string;
  /** Structural fingerprint (§4). Absent on pre-2c cursors → treated STRUCTURAL. */
  fp?: string;
}

interface DirtyFile extends ScannedFile {
  hash: string;
  fp: string;
  lang: LanguageId;
}

interface CodeDirtyDetail {
  /** Target per-file state to persist on a successful publish. */
  next: Record<string, FileState>;
  /** State BEFORE this run (resume baseline). */
  prev: Record<string, FileState>;
  /** Files whose STRUCTURE changed → full re-extract. */
  structural: DirtyFile[];
  /** Files whose change was COSMETIC (reformat/comment) → hash carried, skipped. */
  cosmetic: string[];
  /** Structural files newly seen this scan (drive shadow detection). */
  added: string[];
  deleted: string[];
}

/** The three-method surface the ingest path drives — the real worker manager or
 *  an injected fake (shrink-guard test seam). */
export interface CodeParserLike {
  preload(langIds: LanguageId[]): Promise<void>;
  parse(relPath: string, content: string, langId: LanguageId): Promise<ExtractResult>;
  close(): Promise<void>;
}

/** One file the re-ingest actually parses (structural change + expansion). */
interface EffectiveFile {
  path: string;
  abs: string;
  size: number;
  mtimeMs: number;
  hash: string;
  lang: LanguageId;
}

export interface CodeAdapterOptions {
  /** Relative ingest-cost hint (§4.3); code is the heaviest source. */
  cost?: number;
  /** Force the in-process engine (no worker). Test seam. */
  inProcess?: boolean;
  /** Parser factory override (shrink-guard test seam; default = real worker). */
  parserFactory?: () => CodeParserLike;
  /**
   * Consume a root-level `index.scip` (2e): SCIP upgrades covered identity /
   * reference claims to Observed and arbitrates tree-sitter × SCIP overlap
   * (Observed beats Derived). Default ON — a no-op existsSync when no `index.scip`
   * is present (zero cost on the common path), fail-open when it is malformed.
   * Set false to force tree-sitter-only.
   */
  scip?: boolean;
}

export class CodeSourceAdapter implements SourceAdapter {
  readonly id = SOURCE;
  readonly cost: number;
  readonly #inProcess: boolean;
  readonly #parserFactory: () => CodeParserLike;
  readonly #scip: boolean;

  constructor(opts: CodeAdapterOptions = {}) {
    this.cost = opts.cost ?? 5; // parsing is heavier than a git walk (2) or doc scan (3)
    this.#inProcess = opts.inProcess ?? false;
    this.#parserFactory =
      opts.parserFactory ?? (() => new CodeParser({ inProcess: this.#inProcess }));
    this.#scip = opts.scip ?? true;
  }

  async dirtyCheck(store: Store): Promise<DirtyReport> {
    const files = await scanSourceFiles(store.projectRoot, CODE_EXTENSIONS);
    const prev = readState(store);
    const next: Record<string, FileState> = {};
    const structural: DirtyFile[] = [];
    const cosmetic: string[] = [];
    const added: string[] = [];
    const seen = new Set<string>();

    for (const f of files) {
      const lang = languageForPath(f.path);
      if (!lang) continue; // extension not in the tier-1 set
      seen.add(f.path);
      const p = prev[f.path];
      if (p && p.size === f.size && p.mtimeMs === f.mtimeMs) {
        next[f.path] = p; // (size, mtime) match → unchanged, no hash needed (§4.2)
        continue;
      }
      const scanned = safeRead(f.abs);
      const hash = scanned === undefined ? "" : blake2bHex(scanned);
      const fp = scanned === undefined ? "" : structuralFingerprint(scanned, lang);
      next[f.path] = { size: f.size, mtimeMs: f.mtimeMs, hash, fp };
      if (p && p.hash === hash) continue; // bytes identical, only mtime moved: not dirty
      // A byte change: classify by structural fingerprint (§4).
      if (classifyContentChange(p?.fp, fp) === "cosmetic") {
        cosmetic.push(f.path);
      } else {
        structural.push({ ...f, hash, fp, lang });
        if (!p) added.push(f.path);
      }
    }

    const deleted = Object.keys(prev).filter((path) => !seen.has(path));
    const detail: CodeDirtyDetail = { next, prev, structural, cosmetic, added, deleted };
    const magnitude = structural.length + deleted.length;
    return {
      source: SOURCE,
      dirty: structural.length > 0 || cosmetic.length > 0 || deleted.length > 0,
      // Cosmetic changes still count for ordering so they get their cheap flush,
      // but never dominate a structural backlog.
      magnitude: magnitude + (magnitude === 0 ? cosmetic.length : 0),
      detail,
    };
  }

  async ingest(store: Store, dirty: DirtyReport, budget: Budget): Promise<IngestResult> {
    const detail = dirty.detail as CodeDirtyDetail;
    const knownPaths = new Set(Object.keys(detail.next));

    // ---- COSMETIC-only fast path: no re-extract, no cascade, anchors untouched.
    // Just persist the refreshed (size,mtime,hash,fingerprint) so the next
    // dirtyCheck stops re-flagging the file (§4: "update hash, skip downstream").
    if (detail.structural.length === 0 && detail.deleted.length === 0) {
      if (detail.cosmetic.length > 0) {
        store.setCursor(
          SOURCE,
          JSON.stringify(detail.next),
          budget.now(),
          store.publishedGen(SOURCE),
        );
      }
      return {
        source: SOURCE,
        complete: true,
        entities: 0,
        claims: 0,
        cosmetic: detail.cosmetic.length,
        reingested: 0,
      };
    }

    // ---- Effective re-ingest set = structural ∪ boundary ∪ shadow expansion.
    const changedOrDeleted = new Set<string>([
      ...detail.structural.map((f) => f.path),
      ...detail.deleted,
    ]);
    const boundary = expandBoundary(store, changedOrDeleted);
    const moduleIndex = buildModuleIndex(knownPaths);
    const preShadow = new Set<string>([...changedOrDeleted, ...boundary]);
    const shadow = expandShadow(store, detail.added, moduleIndex, preShadow);

    const effective = new Map<string, EffectiveFile>();
    for (const f of detail.structural) {
      effective.set(f.path, {
        path: f.path,
        abs: f.abs,
        size: f.size,
        mtimeMs: f.mtimeMs,
        hash: f.hash,
        lang: f.lang,
      });
    }
    for (const path of [...boundary, ...shadow]) {
      if (effective.has(path)) continue;
      const ef = toEffectiveFile(store.projectRoot, path, detail.next[path]);
      if (ef) effective.set(path, ef);
    }

    const prevPublishedGen = store.publishedGen(SOURCE);
    const gen = store.beginGeneration(SOURCE);
    const counts = { entities: 0, claims: 0 };

    // ---- Phase A: prev symbols per effective/deleted file (drift + shrink base).
    const prevByFile = new Map<string, Map<string, PrevSymbol>>();
    for (const path of effective.keys()) {
      prevByFile.set(path, readPrevSymbols(store, fileEntityId(path), prevPublishedGen));
    }
    let prevDeletedSymbols = 0;
    const deletedSymbolIds: string[] = [];
    for (const path of detail.deleted) {
      const prevSyms = readPrevSymbols(store, fileEntityId(path), prevPublishedGen);
      prevDeletedSymbols += prevSyms.size;
      deletedSymbolIds.push(...prevSyms.keys());
      flagAnchorDrift(store, prevSyms, [], gen); // gone → target-removed for anchors
      store.clearLinks(fileEntityId(path), "contains");
      store.clearLinks(fileEntityId(path), "imports");
    }

    // ---- Phase B: parse the effective set into a buffer (honor the budget).
    const parser = this.#parserFactory();
    const buffer = new Map<string, { file: EffectiveFile; result: ExtractResult }>();
    let complete = true;
    try {
      const langs = [...new Set([...effective.values()].map((f) => f.lang))];
      if (langs.length > 0) await parser.preload(langs);
      for (const f of effective.values()) {
        if (budget.now() >= budget.deadline) {
          complete = false;
          break; // generation stays unpublished; files stay dirty for resume
        }
        const content = safeRead(f.abs);
        if (content === undefined) continue; // vanished between dirtyCheck and ingest
        let result: ExtractResult;
        try {
          result = await parser.parse(f.path, content, f.lang);
        } catch {
          continue; // transient parse failure → keep the previous symbols (2a rule)
        }
        buffer.set(f.path, { file: f, result });
      }
    } finally {
      await parser.close();
    }

    // ---- Phase C: shrink guard (only on a COMPLETE pass — a partial pass can't
    // be judged; it defers and resumes).
    if (complete) {
      let prevBuffered = 0;
      let newBuffered = 0;
      for (const [path, { result }] of buffer) {
        prevBuffered += prevByFile.get(path)?.size ?? 0;
        newBuffered += result.symbols.length;
      }
      const prevTotal = store.countByKind("symbol", prevPublishedGen);
      const projected = prevTotal - prevBuffered - prevDeletedSymbols + newBuffered;
      const decision = shrinkGuard(prevTotal, projected, detail.deleted.length);
      if (decision.refused) {
        // Refuse: do NOT write the buffer, do NOT publish, do NOT advance the
        // cursor → the previous published generation stays intact and served,
        // the files stay dirty for a later (correct) run. SUCCESS-shaped (§4/G-3).
        return {
          source: SOURCE,
          complete: true,
          entities: 0,
          claims: 0,
          cosmetic: detail.cosmetic.length,
          reingested: effective.size,
          boundaryExpanded: boundary.size,
          shadowExpanded: shadow.size,
          refused: true,
          refusal: {
            reason: decision.reason,
            prevSymbols: decision.prevSymbols,
            projectedSymbols: decision.projectedSymbols,
          },
        };
      }
    }

    // ---- Phase D: commit the buffered results (re-link + drift), then publish.
    let driftFlagged = 0;
    for (const [path, { file, result }] of buffer) {
      store.clearLinks(fileEntityId(path), "contains");
      store.clearLinks(fileEntityId(path), "imports");
      writeFile(store, file, result, gen, knownPaths, counts);
      driftFlagged += flagAnchorDrift(
        store,
        prevByFile.get(path) ?? new Map(),
        result.symbols,
        gen,
      );
    }

    // ---- Phase E: resolve call sites → `calls` edges (2d). Runs AFTER every
    // buffered file's symbols are written, so cross-file `project` callees are
    // resolvable against the full current symbol universe (§5.2).
    const callEdges = writeCallEdges(store, buffer, deletedSymbolIds, gen, counts);

    if (!complete) {
      // Partial pass: persist progress (parsed files done, the rest stay dirty),
      // do not publish. Next refresh resumes the remainder.
      const progress: Record<string, FileState> = { ...detail.prev };
      for (const path of detail.cosmetic) {
        const st = detail.next[path];
        if (st) progress[path] = st;
      }
      for (const path of buffer.keys()) {
        const st = detail.next[path];
        if (st) progress[path] = st;
      }
      store.setCursor(SOURCE, JSON.stringify(progress), budget.now(), gen);
      return {
        source: SOURCE,
        complete: false,
        entities: counts.entities,
        claims: counts.claims,
        cosmetic: detail.cosmetic.length,
        reingested: buffer.size,
        boundaryExpanded: boundary.size,
        shadowExpanded: shadow.size,
        driftFlagged,
        callEdges,
      };
    }

    // ---- Phase F: SCIP arbitration (2e). Upgrade covered identity/reference
    // claims to Observed and arbitrate tree-sitter × SCIP overlap → one link.
    // COMPLETE path only (a partial pass has an incomplete symbol universe) and
    // BEFORE publish, so the SCIP claims share this generation and go live
    // atomically; fail-open leaves the tree-sitter generation exactly as it is.
    const scip: ScipPassResult | undefined = this.#scip
      ? runScipPass(store, {
          repoRoot: store.projectRoot,
          gen,
          effectivePaths: new Set(buffer.keys()),
        })
      : undefined;

    store.setCursor(SOURCE, JSON.stringify(detail.next), budget.now(), gen);
    store.publishGeneration(SOURCE);
    return {
      source: SOURCE,
      complete: true,
      entities: counts.entities,
      claims: counts.claims,
      cosmetic: detail.cosmetic.length,
      reingested: buffer.size,
      boundaryExpanded: boundary.size,
      shadowExpanded: shadow.size,
      driftFlagged,
      callEdges,
      ...(scip !== undefined ? { scip } : {}),
    };
  }
}

function toEffectiveFile(
  root: string,
  path: string,
  state: FileState | undefined,
): EffectiveFile | undefined {
  const lang = languageForPath(path);
  if (!lang || !state) return undefined;
  return {
    path,
    abs: join(root, path),
    size: state.size,
    mtimeMs: state.mtimeMs,
    hash: state.hash,
    lang,
  };
}

function writeFile(
  store: Store,
  f: EffectiveFile,
  result: ExtractResult,
  gen: number,
  knownPaths: ReadonlySet<string>,
  counts: { entities: number; claims: number },
): void {
  const fileId = fileEntityId(f.path);
  store.upsertEntity({
    id: fileId,
    kind: "file",
    name: f.path,
    locator: { t: "file", path: f.path },
    contentHash: f.hash,
    attrs: { lang: f.lang },
    gen,
  });
  counts.entities++;

  for (const sym of result.symbols) {
    writeSymbol(store, fileId, f, sym, gen, counts);
  }

  // Import edges (file→file) — the boundary/shadow graph. Resolve relative
  // specifiers to a project file; external/unresolved specifiers are dropped.
  const linked = new Set<string>();
  for (const imp of result.imports) {
    const target = resolveImport(f.path, imp.source, knownPaths);
    if (!target || target === f.path || linked.has(target)) continue;
    linked.add(target);
    const targetId = fileEntityId(target);
    const claimId = store.addClaim({
      subject: fileId,
      predicate: "imports",
      object: targetId,
      carrier: "tree-sitter",
      locus: `${f.path}#L${imp.line}`,
      method: "structural",
      authority: "derived",
      gen,
    });
    counts.claims++;
    store.setLink({
      src: fileId,
      dst: targetId,
      predicate: "imports",
      method: "structural",
      confidence: 1.0,
      claimId,
    });
  }
}

function writeSymbol(
  store: Store,
  fileId: string,
  f: EffectiveFile,
  sym: SymbolRecord,
  gen: number,
  counts: { entities: number; claims: number },
): void {
  const attrs: Record<string, unknown> = {
    qualified: sym.qualified,
    symbolKind: sym.kind,
    lang: f.lang,
  };
  if (sym.doc) attrs.doc = sym.doc;
  if (sym.arity !== undefined) attrs.arity = sym.arity;

  store.upsertEntity({
    id: sym.id,
    kind: "symbol",
    name: sym.name,
    // Span/line live in the locator (a mutable attribute) — NEVER the id (§3/G-9).
    locator: { t: "file", path: f.path, span: sym.span },
    contentHash: sym.contentHash, // per-symbol hash of node.text (§5.2)
    attrs,
    gen,
  });
  counts.entities++;
  store.ftsIndex(sym.id, {
    name: sym.name,
    text: sym.doc ? `${sym.qualified} ${sym.doc}` : sym.qualified,
    kind: "symbol",
  });

  // Structural containment: file → symbol (Derived — tree-sitter observes the
  // nesting, not a resolved reference). Distinct predicate from touches (2b) /
  // calls (2d), so this never collides with downstream slices.
  const claimId = store.addClaim({
    subject: fileId,
    predicate: "contains",
    object: sym.id,
    carrier: "tree-sitter",
    locus: `${f.path}#L${sym.span[0]}`,
    method: "structural",
    authority: "derived",
    gen,
  });
  counts.claims++;
  store.setLink({
    src: fileId,
    dst: sym.id,
    predicate: "contains",
    method: "structural",
    confidence: 1.0,
    claimId,
  });
}

/**
 * Resolve every buffered file's call sites to `caller-sym --calls--> callee-sym`
 * links (structural claims, Derived — §5.2). The callee-resolution registry is
 * conservative: only `local` / `project` outcomes create an edge; `builtin` /
 * `unknown` (incl. ambiguous and cross-language) create nothing. Returns the
 * number of edges emitted.
 */
function writeCallEdges(
  store: Store,
  buffer: Map<string, { file: EffectiveFile; result: ExtractResult }>,
  deletedSymbolIds: readonly string[],
  gen: number,
  counts: { entities: number; claims: number },
): number {
  // The project-wide symbol universe (freshly-written buffer symbols included).
  const indexed: IndexedSymbol[] = [];
  for (const e of store.entitiesByKind("symbol")) {
    const lang = e.attrs.lang;
    if (e.locator.t !== "file" || typeof lang !== "string") continue;
    indexed.push({ id: e.id, name: e.name, lang: lang as LanguageId, path: e.locator.path });
  }
  const index = buildCalleeIndex(indexed);

  // Clear stale outgoing calls for every symbol being (re)considered this pass:
  // the re-parsed files' symbols + any deleted files' lingering symbols. Links
  // are a mutable current view (unlike append-only claims), so a re-resolution
  // must not leave a redirected/removed callee edge behind.
  for (const { result } of buffer.values()) {
    for (const s of result.symbols) store.clearLinks(s.id, "calls");
  }
  for (const id of deletedSymbolIds) store.clearLinks(id, "calls");

  let edges = 0;
  for (const { file, result } of buffer.values()) {
    const seen = new Set<string>(); // one edge per (caller, callee) per file
    for (const call of result.calls) {
      const callerId = enclosingSymbol(result.symbols, call.line);
      if (!callerId) continue; // a top-level call outside every symbol → unattributed
      const res = resolveCallee(index, file.lang, file.path, call.name);
      if (res.outcome !== "local" && res.outcome !== "project") continue; // builtin/unknown: no edge
      const targetId = res.targetId as string;
      if (targetId === callerId) continue; // self-recursion adds no navigational value
      const key = `${callerId} ${targetId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const claimId = store.addClaim({
        subject: callerId,
        predicate: "calls",
        object: targetId,
        carrier: "tree-sitter",
        locus: `${file.path}#L${call.line}`,
        method: "structural",
        authority: "derived",
        gen,
      });
      counts.claims++;
      store.setLink({
        src: callerId,
        dst: targetId,
        predicate: "calls",
        method: "structural",
        confidence: res.outcome === "local" ? 1.0 : 0.85,
        claimId,
      });
      edges++;
    }
  }
  return edges;
}

function readState(store: Store): Record<string, FileState> {
  const cursor = store.getCursor(SOURCE);
  if (!cursor?.position) return {};
  try {
    return JSON.parse(cursor.position) as Record<string, FileState>;
  } catch {
    return {};
  }
}

function safeRead(abs: string): string | undefined {
  try {
    return readFileSync(abs, "utf8");
  } catch {
    return undefined;
  }
}

export function createCodeAdapter(opts?: CodeAdapterOptions): SourceAdapter {
  return new CodeSourceAdapter(opts);
}
