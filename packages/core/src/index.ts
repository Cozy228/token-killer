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

/** Milestone marker kept from slice 1a; the CLI stub prints it until 1i. */
export const CTX_CORE_SCAFFOLD = "m1-1a" as const;
