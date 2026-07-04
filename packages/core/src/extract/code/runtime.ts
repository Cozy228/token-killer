/**
 * Shared tree-sitter engine (CTX-IMPL §5.2). Runs in whatever thread owns it —
 * the parse worker in production, or in-process for unit tests and the no-worker
 * fallback. Holds the grammar/parser/query caches and the D23 parser-recycle
 * counter. No `worker_threads`, no store, no I/O beyond asset reads.
 *
 * Grammars load LAZILY (only when a file of that language is parsed) and
 * SEQUENTIALLY (a single load chain — the documented web-tree-sitter WASM init
 * race on Node 20+ requires grammars be loaded one at a time). A grammar that
 * fails to load is recorded unavailable and skipped; its files yield no symbols
 * rather than crashing the run.
 */
import { Language, Parser, Query } from "web-tree-sitter";
import { grammarWasmPath, readQuerySource } from "./assets.ts";
import { extractFromTree } from "./extract.ts";
import type { LanguageId } from "./languages.ts";
import type { ExtractResult } from "./symbol.ts";

/** D23: recycle a language's parser instance every N parses to reclaim the
 *  fragmenting WASM heap (codegraph constant, read from
 *  docs/codemap/impl/D-language-coverage.md §D4/D5/D6). */
export const PARSER_RESET_INTERVAL = 5000;

const EMPTY = (id: LanguageId): ExtractResult => ({
  language: id,
  symbols: [],
  imports: [],
  calls: [],
  hadError: false,
});

export class CodeParserCore {
  #initialized = false;
  #initPromise: Promise<void> | null = null;
  #loadChain: Promise<void> = Promise.resolve();
  readonly #languages = new Map<LanguageId, Language>();
  readonly #parsers = new Map<LanguageId, Parser>();
  readonly #queries = new Map<LanguageId, Query>();
  readonly #counts = new Map<LanguageId, number>();
  readonly #unavailable = new Set<LanguageId>();

  /** Languages whose grammar is loaded (drives the B1-worker laziness assertion). */
  loadedLanguages(): LanguageId[] {
    return [...this.#languages.keys()];
  }

  /** Grammars that failed to load (skipped, not fatal). */
  unavailableLanguages(): LanguageId[] {
    return [...this.#unavailable];
  }

  async ensureLanguage(id: LanguageId): Promise<boolean> {
    if (this.#languages.has(id)) return true;
    if (this.#unavailable.has(id)) return false;
    // Chain onto the single load queue so grammars never load concurrently.
    this.#loadChain = this.#loadChain.then(() => this.#loadOne(id));
    await this.#loadChain;
    return this.#languages.has(id);
  }

  async #loadOne(id: LanguageId): Promise<void> {
    if (this.#languages.has(id) || this.#unavailable.has(id)) return;
    try {
      await this.#ensureInit();
      const lang = await Language.load(grammarWasmPath(id));
      const parser = new Parser();
      parser.setLanguage(lang);
      this.#languages.set(id, lang);
      this.#parsers.set(id, parser);
      this.#queries.set(id, new Query(lang, readQuerySource(id)));
    } catch {
      this.#unavailable.add(id);
    }
  }

  async #ensureInit(): Promise<void> {
    if (this.#initialized) return;
    this.#initPromise ??= Parser.init().then(() => {
      this.#initialized = true;
    });
    await this.#initPromise;
  }

  async parse(relPath: string, content: string, id: LanguageId): Promise<ExtractResult> {
    const available = await this.ensureLanguage(id);
    if (!available) return EMPTY(id);
    const parser = this.#parsers.get(id);
    const query = this.#queries.get(id);
    if (!parser || !query) return EMPTY(id);
    const tree = parser.parse(content);
    if (!tree) return { ...EMPTY(id), hadError: true };
    try {
      return extractFromTree(relPath, tree.rootNode, query, id);
    } finally {
      tree.delete();
      const n = (this.#counts.get(id) ?? 0) + 1;
      this.#counts.set(id, n);
      if (n % PARSER_RESET_INTERVAL === 0) this.#recycle(id);
    }
  }

  #recycle(id: LanguageId): void {
    const lang = this.#languages.get(id);
    this.#parsers.get(id)?.delete();
    if (lang) {
      const parser = new Parser();
      parser.setLanguage(lang);
      this.#parsers.set(id, parser);
    }
  }

  dispose(): void {
    for (const q of this.#queries.values()) q.delete();
    for (const p of this.#parsers.values()) p.delete();
    this.#parsers.clear();
    this.#queries.clear();
    this.#languages.clear();
    this.#counts.clear();
  }
}
