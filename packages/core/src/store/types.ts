/**
 * Shared store types — the contract 1c/1d/1e build against (CTX-IMPL §2/§3).
 */

/** Entity kinds (CTX-IMPL §2 `entities.kind`). */
export type EntityKind =
  | "symbol"
  | "file"
  | "module"
  | "commit"
  | "pr"
  | "issue"
  | "decision"
  | "doc_section"
  | "story"
  | "meeting"
  | "memory"
  | "concept";

/** Claim authority ladder (CTX-IMPL §2 CHECK constraint). */
export type Authority = "observed" | "derived" | "inferred" | "confirmed";

/** Claim/link derivation method (CTX-IMPL §2 `claims.method`). */
export type ClaimMethod =
  | "explicit-key"
  | "path-match"
  | "symbol-match"
  | "rename-tracked"
  | "structural"
  | "semantic-proposal";

/** Handle facets (P28 addenda; applicability varies per kind). */
export type Facet = "callers" | "callees" | "diff" | "text" | "detail" | "history" | "full";

/**
 * Locator — read-through address (index-not-copy, P25①). JSON discriminated
 * union persisted in `entities.locator` (CTX-IMPL §3).
 *
 * File spans are 1-based inclusive [startLine, endLine].
 */
export type Locator =
  | { t: "file"; path: string; span?: [number, number] }
  | { t: "git"; oid: string }
  | { t: "snapshot"; carrier: string; file: string; ptr?: string }
  | { t: "store" };

export interface EntityInput {
  id: string; // "<kind>:<stable-key>" (§3 id schemes)
  kind: EntityKind;
  name: string;
  locator: Locator;
  contentHash?: string;
  sourceRev?: string;
  attrs?: Record<string, unknown>;
  gen: number; // building generation stamp (§4 generation publish)
}

export interface Entity {
  id: string;
  kind: EntityKind;
  name: string;
  locator: Locator;
  contentHash: string | undefined;
  sourceRev: string | undefined;
  attrs: Record<string, unknown>;
  firstSeen: number; // epoch-ms (ADR 0041 §11 convention carried)
  lastVerified: number;
  gen: number;
}

export interface ClaimInput {
  subject: string; // entity id
  predicate: string;
  object?: string; // entity id or JSON scalar
  carrier: string; // git|files|tree-sitter|scip|github|jira|confluence|remember|host:<h>
  locus?: string; // where inside the carrier (commit oid, file#Lx, api path)
  method: ClaimMethod;
  authority: Authority;
  gen: number;
}

export interface Claim {
  id: number;
  subject: string;
  predicate: string;
  object: string | undefined;
  carrier: string;
  locus: string | undefined;
  method: ClaimMethod;
  authority: Authority;
  at: number;
  gen: number;
}

export interface LinkInput {
  src: string;
  dst: string;
  predicate: string;
  method: ClaimMethod;
  confidence?: number; // default 1.0
  claimId?: number; // provenance back-pointer
}

export interface Link {
  src: string;
  dst: string;
  predicate: string;
  method: ClaimMethod;
  confidence: number;
  claimId: number | undefined;
  verifiedAt: number;
  stale: boolean;
}

export type ConflictKind = "contradiction" | "sameAsCandidate" | "stale-suspect";
export type ConflictStatus = "open" | "resolved" | "dismissed";

export interface Conflict {
  a: number; // claim id
  b: number; // claim id
  kind: ConflictKind;
  status: ConflictStatus;
}

export type MemoryOrigin = `host-import:${string}` | "remember" | "human-note";
export type MemoryStatus = "active" | "needs-review" | "superseded" | "retired";

export interface MemoryInput {
  entityId: string; // mem:<ulid> entity, created via upsertEntity first
  gist: string; // hard cap 240 chars, enforced at write (§2)
  detail?: string;
  origin: MemoryOrigin;
  sessionRef?: string;
  authority: "inferred" | "confirmed";
  status?: MemoryStatus;
}

export interface MemoryRow {
  entityId: string;
  gist: string;
  detail: string | undefined;
  origin: MemoryOrigin;
  sessionRef: string | undefined;
  authority: "inferred" | "confirmed";
  status: MemoryStatus;
  servedCount: number;
  lastServed: number | undefined;
}

export interface Cursor {
  source: string;
  position: string | undefined;
  freshness: number | undefined;
  gen: number | undefined;
}

export interface FtsHit {
  entityId: string;
  rank: number;
}

export interface LeaseState {
  holder: string;
  expiresAt: number; // epoch-ms
}

export type LeaseResult =
  | { acquired: true; lease: LeaseState }
  | { acquired: false; lease: LeaseState }; // current holder's lease

/**
 * Read-through result. Recoverable failures are values, never exceptions —
 * serve (1g) turns them into success-shaped guidance (G-3).
 */
export type ReadThroughResult =
  | { ok: true; text: string; drift: boolean; via: "file" | "git" | "store" }
  | { ok: false; reason: ReadThroughFailure; message: string };

export type ReadThroughFailure =
  | "no-entity"
  | "not-found"
  | "traversal-rejected"
  | "not-allowlisted"
  | "too-large"
  | "binary"
  | "bad-oid"
  | "unsupported";
