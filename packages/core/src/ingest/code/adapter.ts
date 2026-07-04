/**
 * Code source adapter (CTX-IMPL §4 SourceAdapter, §5.2 code structure) — slice
 * 2a. Registers with id `'code'` in the default registry.
 *
 * Lands: tree-sitter symbol entities (spans + per-symbol content_hash) for the
 * 7 tier-1 languages, extracted in a respawnable parse worker; a (size,mtime)
 * pre-filter + content-hash-confirm dirty scan honoring .gitignore via the
 * shared `git ls-files` fast path. Symbol/`.scm`/worker contract is pinned here;
 * symbol-level `touches` (2b), fingerprint invalidation (2c), call edges +
 * facets (2d) and SCIP arbitration (2e) build on top.
 *
 * Identity (§3): `file:<path>` (shared with git/docs) contains
 * `sym:<path>#<qualified>[~<disambig>]`. Spans/hashes are attributes, never
 * identity (G-9). The extractor reads span text via `node.text` only (G-8).
 */
import { readFileSync } from "node:fs";
import type { Store } from "../../store/store.ts";
import { blake2bHex } from "../../store/hash.ts";
import type { Budget, DirtyReport, IngestResult, SourceAdapter } from "../adapter.ts";
import { scanSourceFiles, type ScannedFile } from "../scan.ts";
import { CodeParser } from "../../extract/code/codeParser.ts";
import { CODE_EXTENSIONS, languageForPath, type LanguageId } from "../../extract/code/languages.ts";
import type { ExtractResult, SymbolRecord } from "../../extract/code/symbol.ts";

const SOURCE = "code" as const;

interface FileState {
  size: number;
  mtimeMs: number;
  hash: string;
}

interface DirtyFile extends ScannedFile {
  hash: string;
  lang: LanguageId;
}

interface CodeDirtyDetail {
  /** Target per-file state to persist on a successful publish. */
  next: Record<string, FileState>;
  /** State BEFORE this run (resume baseline). */
  prev: Record<string, FileState>;
  dirtyFiles: DirtyFile[];
  deleted: string[];
}

export interface CodeAdapterOptions {
  /** Relative ingest-cost hint (§4.3); code is the heaviest source. */
  cost?: number;
  /** Force the in-process engine (no worker). Test seam. */
  inProcess?: boolean;
}

export class CodeSourceAdapter implements SourceAdapter {
  readonly id = SOURCE;
  readonly cost: number;
  readonly #inProcess: boolean;

  constructor(opts: CodeAdapterOptions = {}) {
    this.cost = opts.cost ?? 5; // parsing is heavier than a git walk (2) or doc scan (3)
    this.#inProcess = opts.inProcess ?? false;
  }

  async dirtyCheck(store: Store): Promise<DirtyReport> {
    const files = await scanSourceFiles(store.projectRoot, CODE_EXTENSIONS);
    const prev = readState(store);
    const next: Record<string, FileState> = {};
    const dirtyFiles: DirtyFile[] = [];
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
      const hash = safeHash(f.abs);
      next[f.path] = { size: f.size, mtimeMs: f.mtimeMs, hash };
      if (!p || p.hash !== hash) dirtyFiles.push({ ...f, hash, lang });
      // p && p.hash === hash → cosmetic touch (mtime moved, bytes identical): not dirty.
    }
    const deleted = Object.keys(prev).filter((path) => !seen.has(path));
    const detail: CodeDirtyDetail = { next, prev, dirtyFiles, deleted };
    return {
      source: SOURCE,
      dirty: dirtyFiles.length > 0 || deleted.length > 0,
      magnitude: dirtyFiles.length + deleted.length,
      detail,
    };
  }

  async ingest(store: Store, dirty: DirtyReport, budget: Budget): Promise<IngestResult> {
    const detail = dirty.detail as CodeDirtyDetail;
    const gen = store.beginGeneration(SOURCE);
    const counts = { entities: 0, claims: 0 };

    // Resume baseline: everything already committed, minus files being re-parsed
    // (so an interrupted run re-parses only the remainder next time).
    const progress: Record<string, FileState> = { ...detail.next };
    for (const f of detail.dirtyFiles) delete progress[f.path];

    const parser = new CodeParser({ inProcess: this.#inProcess });
    let complete = true;
    try {
      // Preload only the grammars present in the changed set (sequential, lazy).
      const langs = [...new Set(detail.dirtyFiles.map((f) => f.lang))];
      if (langs.length > 0) await parser.preload(langs);

      for (const f of detail.dirtyFiles) {
        if (budget.now() >= budget.deadline) {
          complete = false;
          break; // generation stays unpublished; cursor holds the resume point
        }
        let content: string;
        try {
          content = readFileSync(f.abs, "utf8");
        } catch {
          continue; // vanished between dirtyCheck and ingest — a later refresh re-checks
        }
        let result: ExtractResult;
        try {
          result = await parser.parse(f.path, content, f.lang);
        } catch {
          continue; // parse failed for this file — skip it, keep the run going
        }
        writeFile(store, f, result, gen, counts);
        progress[f.path] = { size: f.size, mtimeMs: f.mtimeMs, hash: f.hash };
        store.setCursor(SOURCE, JSON.stringify(progress), budget.now(), gen);
      }
    } finally {
      await parser.close();
    }

    if (!complete) {
      return { source: SOURCE, complete: false, entities: counts.entities, claims: counts.claims };
    }
    store.setCursor(SOURCE, JSON.stringify(detail.next), budget.now(), gen);
    store.publishGeneration(SOURCE);
    return { source: SOURCE, complete: true, entities: counts.entities, claims: counts.claims };
  }
}

function writeFile(
  store: Store,
  f: DirtyFile,
  result: ExtractResult,
  gen: number,
  counts: { entities: number; claims: number },
): void {
  const fileId = `file:${f.path}`;
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
}

function writeSymbol(
  store: Store,
  fileId: string,
  f: DirtyFile,
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

function readState(store: Store): Record<string, FileState> {
  const cursor = store.getCursor(SOURCE);
  if (!cursor?.position) return {};
  try {
    return JSON.parse(cursor.position) as Record<string, FileState>;
  } catch {
    return {};
  }
}

function safeHash(abs: string): string {
  try {
    return blake2bHex(readFileSync(abs, "utf8"));
  } catch {
    return "";
  }
}

export function createCodeAdapter(opts?: CodeAdapterOptions): SourceAdapter {
  return new CodeSourceAdapter(opts);
}
