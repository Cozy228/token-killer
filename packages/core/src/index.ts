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

/** Milestone marker kept from slice 1a; the CLI stub prints it until 1i. */
export const CTX_CORE_SCAFFOLD = "m1-1a" as const;
