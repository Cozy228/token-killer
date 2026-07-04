/**
 * @ctx/core — public entry.
 *
 * Slice 1b pins the foundation contract: `Store` (store spine, CTX-IMPL §2/§3)
 * and `SourceAdapter`/`RefreshEngine` (ingest framework, §4). 1c/1d/1e build
 * against these types; extract/select/serve layers land in later M1 slices.
 */

// store spine
export {
  openStore,
  scrubToProjectRelative,
  LEASE_TTL_MS,
  MEMORY_GIST_MAX_CHARS,
} from "./store/store.ts";
export type { Store, OpenStoreOptions } from "./store/store.ts";
export { resolveShard, ctxHome, shardDir, storePath, SHARD_HEX_LEN } from "./store/shard.ts";
export type { ShardResolution } from "./store/shard.ts";
export {
  parseHandle,
  printShortHandle,
  shortHandleCandidate,
  kindInitial,
  HANDLE_MIN_LEN,
} from "./store/handles.ts";
export type { ParsedHandle } from "./store/handles.ts";
export { READ_THROUGH_MAX_BYTES } from "./store/readthrough.ts";
export { runMigrations, schemaVersionOf } from "./store/migrate.ts";
export type { MigrationOutcome } from "./store/migrate.ts";
export { blake2bHex } from "./store/hash.ts";
export type * from "./store/types.ts";

// ingest framework
export { SourceRegistry } from "./ingest/adapter.ts";
export type {
  SourceAdapter,
  SourceId,
  DirtyReport,
  Budget,
  IngestResult,
} from "./ingest/adapter.ts";
export { RefreshEngine, CATCHUP_GATE_MS } from "./ingest/refresh.ts";
export type {
  RefreshReport,
  SourceRefresh,
  SourceState,
  RefreshEngineOptions,
} from "./ingest/refresh.ts";
export { createDefaultRegistry } from "./ingest/registry.ts";
export type { RegistryOptions } from "./ingest/registry.ts";

// git source (slice 1d)
export { createGitAdapter, GitAdapter } from "./ingest/git/adapter.ts";
export type { GitAdapterOptions } from "./ingest/git/adapter.ts";
export {
  computeCochange,
  DEFAULT_COCHANGE_WINDOW,
  COCHANGE_MIN_SUPPORT,
  DEFAULT_MAX_FILES_PER_COMMIT,
} from "./ingest/git/cochange.ts";
export type { CochangePair, CochangeOptions } from "./ingest/git/cochange.ts";
export { parseLog, walkCommits, walkWindow, LOG_FORMAT } from "./ingest/git/walk.ts";
export type { CommitRecord, FileChange, FileChangeStatus } from "./ingest/git/walk.ts";
export { parseReferences } from "./ingest/git/trailers.ts";
export type { CommitReference, CommitReferenceKind } from "./ingest/git/trailers.ts";
export { headOid, revListCount, rawLog, GitError, GIT_MAX_BUFFER } from "./ingest/git/gitCli.ts";

// docs/decisions source (slice 1e)
export { DocsAdapter, classifyDoc, scanMarkdown } from "./ingest/docs.ts";
export { DEFAULT_IGNORE_DIRS, MAX_FILE_SIZE, isIgnoredDir } from "./ingest/ignore.ts";
export {
  scanSourceFiles,
  gitVisibleSet,
  clearScanCache,
  SCAN_CACHE_TTL_MS,
} from "./ingest/scan.ts";
export type { ScannedFile } from "./ingest/scan.ts";

// code source (slice 2a): tree-sitter WASM scaffold + symbol entities
export { CodeSourceAdapter, createCodeAdapter } from "./ingest/code/adapter.ts";
export type { CodeAdapterOptions } from "./ingest/code/adapter.ts";
export {
  LANGUAGES,
  TIER1_LANGUAGE_IDS,
  CODE_EXTENSIONS,
  languageForPath,
} from "./extract/code/languages.ts";
export type { LanguageId, LanguageDef } from "./extract/code/languages.ts";
export { extractFromTree } from "./extract/code/extract.ts";
export { symbolId, KIND_PRIORITY } from "./extract/code/symbol.ts";
export type {
  SymbolRecord,
  SymbolKind,
  ImportRecord,
  CallRecord,
  ExtractResult,
  LineSpan,
} from "./extract/code/symbol.ts";
// NOTE: the in-process engine (CodeParserCore, PARSER_RESET_INTERVAL) is
// deliberately NOT re-exported here — that keeps `web-tree-sitter` out of the
// main-thread bundle so it loads lazily only inside the parse worker (or the
// dynamic-import fallback). Tests import it directly from extract/code/runtime.ts.
export {
  CodeParser,
  WORKER_RECYCLE_INTERVAL,
  PARSE_TIMEOUT_BASE_MS,
  PARSE_TIMEOUT_STEP_BYTES,
  PARSE_TIMEOUT_STEP_MS,
} from "./extract/code/codeParser.ts";
export type { CodeParserOptions } from "./extract/code/codeParser.ts";
export { grammarWasmPath, readQuerySource } from "./extract/code/assets.ts";
export { POISON_CONTENT, HANG_CONTENT } from "./extract/code/protocol.ts";
export {
  parseMarkdown,
  matchGlossary,
  classifyMention,
  slugify,
  DOC_EXTS,
} from "./extract/markdown.ts";
export type {
  ParsedMarkdown,
  Frontmatter,
  HeadingNode,
  GlossaryEntry,
  Mention,
  MentionKind,
} from "./extract/markdown.ts";

// memory source (slice 1c): remember/recall + host import + lifecycle
export { MemorySourceAdapter } from "./memory/adapter.ts";
export {
  importClaudeCodeMemory,
  resolveClaudeMemoryDir,
  claudeProjectSlug,
  parseFrontmatter,
  parseMemoryIndex,
  toGist,
} from "./memory/claudeImporter.ts";
export type { ImportOptions, ImportReport } from "./memory/claudeImporter.ts";
export {
  remember,
  recall,
  listMemories,
  setMemoryLifecycle,
  LIFECYCLE_STATUS,
} from "./memory/remember.ts";
export type {
  RememberInput,
  RememberResult,
  RecallResult,
  MemoryListItem,
  LifecycleResult,
  EntityCandidate,
} from "./memory/remember.ts";
export { ulid, deterministicUlid, memoryId } from "./memory/ulid.ts";
export {
  SENTINEL_BEGIN,
  SENTINEL_END,
  hasSentinel,
  stripSentinelBlocks,
} from "./memory/sentinel.ts";
export {
  fuzzyDuplicate,
  shannonEntropy,
  embeddedNumbers,
  MIN_GIST_CHARS,
  MIN_ENTROPY_BITS,
  JACCARD_THRESHOLD,
} from "./memory/dedup.ts";
export type { DedupVerdict } from "./memory/dedup.ts";

// selection engine (slice 1f): select()/search() library calls, typed structs
export { select, search } from "./select/engine.ts";
export { SECTION_ORDER } from "./select/types.ts";
export type {
  BudgetTier,
  SectionName,
  RenderTier,
  RenderedItem,
  OmittedItem,
  SectionResult,
  SelectionEnvelope,
  SelectMode,
  SelectResult,
  SelectMiss,
  SelectInput,
  SearchInput,
  SearchItem,
  SearchResult,
  FacetResult,
} from "./select/types.ts";
export { disclosedConstants } from "./select/constants.ts";
export {
  tokenizeQuery,
  getStemVariants,
  splitIdentifier,
  isIdentifierShaped,
  isDistinctiveIdentifier,
  toFtsMatch,
  STOPWORDS,
} from "./select/tokenize.ts";
export type { QueryToken } from "./select/tokenize.ts";
export { personalizedPageRank } from "./select/ppr.ts";
export type { PprEdge, PprOptions } from "./select/ppr.ts";
export { rrfFuse, rankOf, timeDecay, confidenceFactor, historyHeat } from "./select/rank.ts";
export { sectionBudgets, totalBudgetTokens, sectionOf } from "./select/sections.ts";
export { estimateTokens } from "./select/project.ts";
export { snapshotVisibility } from "./select/visibility.ts";

// push surface (slice 1h): ≤1KB digest builder + host adapters + pin/veto
export {
  buildPushBlock,
  renderPushBlock,
  PUSH_MAX_BYTES,
  PUSH_MAX_GOTCHAS,
  BLOCK_BEGIN,
  BLOCK_END,
  HEADER_LINES,
} from "./push/block.ts";
export type { PushBlock, BuildBlockOptions } from "./push/block.ts";
export { rankGotchas } from "./push/rank.ts";
export type { GotchaCandidate } from "./push/rank.ts";
export { parsePushConfig, stripJsonComments, emptyPushConfig } from "./push/config.ts";
export type { PushConfig } from "./push/config.ts";
export {
  applyManagedBlock,
  extractManagedBlock,
  writeManagedBlock,
  placePushBlock,
  DEFAULT_PUSH_TARGETS,
} from "./push/hosts.ts";
export type { PlacementResult, PlacePushOptions, WriteOptions } from "./push/hosts.ts";
export {
  runPush,
  editPinVeto,
  readPushConfig,
  pushConfigPath,
  PUSH_CONFIG_REL,
  PUSH_SHA_META,
} from "./push/push.ts";
export type {
  RunPushOptions,
  RunPushResult,
  PinVetoResult,
  PinVetoList,
  PinVetoAction,
} from "./push/push.ts";

// serving surface (slice 1g): the 3 MCP tools as library calls + §7 render
export { serveContext, serveSearch, serveRemember, SERVE_BUDGET_MS } from "./serve/serve.ts";
export type { ContextArgs, SearchArgs, RememberArgs } from "./serve/serve.ts";
export { assertNoEgress, EGRESS_ENV_KEYS } from "./serve/egress.ts";
export {
  renderContext,
  renderSearch,
  renderFacet,
  renderMiss,
  renderAmbiguous,
  freshnessLabel,
} from "./serve/render.ts";
export type { RenderOut } from "./serve/render.ts";
export { MAX_RESPONSE_CHARS, OMITTED_HANDLES_PER_SECTION } from "./serve/types.ts";
export type { ServeResponse, ServeDeps, ServeDiag, ServeKind } from "./serve/types.ts";

// install/doctor (slice 1i): managed host writes + read-only verification.
// Push-block placement REUSES slice 1h's push surface (placePushBlock /
// buildPushBlock / extractManagedBlock / PUSH_MAX_BYTES); 1i adds only MCP
// registration, the doctor checks, and byte-exact removal (removePush).
export {
  installProject,
  installMcpRegistration,
  removePush,
  MCP_CONFIG_FILE,
} from "./install/install.ts";
export type { InstallOptions, InstallResult, FileWrite, WriteAction } from "./install/install.ts";
export { runDoctor, formatDoctorReport } from "./install/doctor.ts";
export type { DoctorCheck, DoctorReport, DoctorOptions } from "./install/doctor.ts";
export {
  CTX_MCP_SERVER_NAME,
  ctxServerEntry,
  upsertMcpServer,
  readMcpServer,
  isCtxMcpEntry,
  McpConfigParseError,
} from "./install/mcpConfig.ts";
export type { McpServerEntry } from "./install/mcpConfig.ts";
export {
  compareVersion,
  nodeVersion,
  sqliteVersion,
  MIN_NODE,
  MIN_SQLITE,
} from "./install/versions.ts";

/** Milestone marker kept from slice 1a; the CLI stub prints it until 1i. */
export const CTX_CORE_SCAFFOLD = "m1-1a" as const;
