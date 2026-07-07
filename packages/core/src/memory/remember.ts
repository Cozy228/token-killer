/**
 * `remember()` / `recall()` + memory lifecycle (CTX-IMPL §5.6, §7; P28 addenda).
 *
 * Every recoverable condition is SUCCESS-SHAPED (a returned value carrying
 * guidance), never a thrown error (§7 serving rule / G-3):
 * - a note whose gist exceeds 240 chars → guidance to split note/detail,
 *   NOTHING is written;
 * - unresolved anchors → guidance listing candidate entities, NOTHING is
 *   written until the caller resolves or drops them.
 *
 * Only malformed inputs would throw; the store enforces the 240-char invariant
 * as a backstop (RangeError), which we pre-empt so callers see guidance instead.
 */
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { shortHandleCandidate } from "../store/handles.ts";
import type { Store } from "../store/store.ts";
import type {
  Authority,
  EntityKind,
  Facet,
  MemoryEventVerb,
  MemoryOrigin,
  MemoryStatus,
} from "../store/types.ts";
import { MEMORY_GIST_MAX_CHARS } from "./claudeImporter.ts";
import { currentHeadCommit } from "./anchoredAt.ts";
import { fuzzyDuplicate } from "./dedup.ts";
import type { MemoryFiles, MemoryZone } from "./fileStore.ts";
import { ulidOf } from "./fileStore.ts";
import { scanMemoryForSecret, secretRemediationNote } from "./secretGuard.ts";
import { refoldMemory, resolveConflictViaEvent } from "./fold.ts";
import { ulid, memoryId } from "./ulid.ts";
import { recordCreate, recordDecision } from "./writeThrough.ts";

const MEMORY_SOURCE = "memory";

/** Caller-surface → landing zone/status/actor (S8a + slice-5 `local`). */
const ROUTE_FOR_SURFACE: Record<
  "cli" | "mcp" | "local",
  { zone: MemoryZone; status: MemoryStatus; actor: string }
> = {
  cli: { zone: "mainline", status: "active", actor: "cli" },
  mcp: { zone: "overlay", status: "needs-review", actor: "agent" },
  local: { zone: "overlay", status: "active", actor: "cli" },
};

export interface RememberInput {
  note: string;
  detail?: string;
  anchors?: string[];
  supersedes?: string;
  sessionRef?: string;
  /** User/agent assertions are `confirmed` by default (they carry authority). */
  authority?: "inferred" | "confirmed";
  now?: () => number;
  /**
   * S8a caller-surface split (slice 4/5). The landing zone + status are decided by
   * WHO called `remember()`, because E3 governs it (committed = human-authored or
   * human-confirmed). REQUIRED (slice 5): no default — a caller that forgets its
   * surface is a compile error, never a silent commit into the shared zone (the
   * slice-4 fail-open advisory).
   *   - `cli` (human at the CLI) → committed MAINLINE as `active` (E4's
   *     "`remember()` defaults to Mainline" applies to this human surface). The
   *     E4 secret guard runs before the committed zone and diverts a secret-shaped
   *     note to the overlay as `needs-review`.
   *   - `mcp` (agent over MCP) → personal OVERLAY as `needs-review` (auto-generated
   *     → never enters git unreviewed; human `confirm` promotes it, same pipeline
   *     as host imports).
   *   - `local` (human, `remember --local`) → personal OVERLAY as `active`
   *     (slice 5, three-tier (c) / E4). A deliberately divergent my-view note: a
   *     human authored it (no review queue) but it NEVER syncs — gitignored,
   *     never promoted, never in a peer's push digest.
   */
  surface: "cli" | "mcp" | "local";
  /**
   * Committed / overlay file writer. Production write paths (CLI, MCP `serve.ts`)
   * always pass one; write-through is always-on there (slice 4). Kept injectable
   * so store-only unit fixtures and living-repo tests can redirect the `.ctx`
   * writer at a sandbox and never touch the real repo (the hard constraint).
   */
  files?: MemoryFiles;
}

export interface EntityCandidate {
  entityId: string;
  name: string;
  kind: EntityKind;
  handle: string;
}

/**
 * Deterministic pre-write advisory (P28/D3): the write ALWAYS succeeds — this
 * only surfaces a near-duplicate the caller may want to reconcile. `dup-candidate`
 * = a near-dup was found and linked (sameAsCandidate claim+link+conflict), both
 * kept; when the caller passed no `supersedes`, the advisory also names the
 * candidate as a `supersede-candidate` so a human/agent can choose to replace it.
 * ctx never auto-applies a supersede.
 */
export interface WriteAdvisory {
  kind: "supersede-candidate";
  guidance: string;
  candidates: EntityCandidate[];
}

export type RememberResult =
  | {
      ok: true;
      entityId: string;
      handle: string;
      gist: string;
      anchors: string[];
      /** Landing status (S8a): `active` for a committed CLI note, `needs-review`
       *  for an agent/MCP note or an E4-diverted secret. */
      status: MemoryStatus;
      supersededId?: string;
      /** Present only when a near-duplicate was found + linked (never blocks). */
      advisory?: WriteAdvisory;
      /** Success-shaped E4 remediation note when a secret-shaped committed write
       *  was diverted to the overlay as `needs-review` (never a hard error). */
      remediation?: string;
      /** Slice 5: the note landed in the gitignored personal overlay and will
       *  NEVER be shared — chosen via `--local` (surface `local`) or forced by the
       *  repo E4 opt-out. The CLI discloses "local only — never shared". */
      localOnly?: boolean;
      /** Slice 5: the repo opted out of committing memory (E4), so a CLI note that
       *  would normally commit was kept local. Distinguishes the opt-out case from
       *  an explicit `--local` for the disclosure text. */
      committedZoneDisabled?: boolean;
    }
  | {
      ok: false;
      reason: "gist-too-long" | "unresolved-anchors" | "unresolved-supersedes";
      guidance: string;
      gistLength?: number;
      candidates?: Record<string, EntityCandidate[]>;
    };

export type RecallResult =
  | {
      ok: true;
      entityId: string;
      kind: EntityKind;
      handle: string;
      gist?: string;
      detail?: string;
      status?: MemoryStatus;
      text: string;
    }
  | { ok: false; reason: "unknown-handle" | "unreadable"; guidance: string };

function displayHandle(store: Store, entityId: string, facet?: Facet): string {
  return store.internHandle(entityId, facet);
}

/** Best-effort candidate list for an unresolved anchor (FTS + name search). */
function candidatesFor(store: Store, anchor: string): EntityCandidate[] {
  const query = anchor
    .replace(/^[a-z_]+:/, "")
    .replace(/[^A-Za-z0-9_]+/g, " ")
    .trim();
  if (query.length === 0) return [];
  const hits = store.ftsSearch(query, 5);
  const out: EntityCandidate[] = [];
  for (const hit of hits) {
    const e = store.getEntity(hit.entityId);
    if (!e) continue;
    out.push({
      entityId: e.id,
      name: e.name,
      kind: e.kind,
      handle: shortHandleCandidate(e.id, undefined, 5),
    });
  }
  return out;
}

interface AnchorPlan {
  resolved: string[]; // entity ids that already exist / will exist
  toCreate: Array<{ id: string; path: string }>; // file entities to auto-create
  unresolved: string[];
}

/**
 * Resolve each anchor WITHOUT writing: an existing entity/handle resolves
 * directly; a `file:<rel>` anchor whose file exists under the project root is
 * planned for auto-creation (anchoring to a real file is valid even before the
 * docs source has ingested it). Anything else is unresolved.
 */
function planAnchors(store: Store, anchors: string[]): AnchorPlan {
  const plan: AnchorPlan = { resolved: [], toCreate: [], unresolved: [] };
  for (const anchor of anchors) {
    const viaHandle = store.resolveHandle(anchor);
    if (viaHandle && store.getEntity(viaHandle.entityId)) {
      plan.resolved.push(viaHandle.entityId);
      continue;
    }
    const fileMatch = /^file:(.+)$/.exec(anchor.trim());
    if (fileMatch) {
      const rel = fileMatch[1] as string;
      const safe = rel.length > 0 && !isAbsolute(rel) && !rel.split(/[\\/]/).includes("..");
      if (safe && existsSync(join(store.projectRoot, rel))) {
        plan.toCreate.push({ id: `file:${rel}`, path: rel });
        plan.resolved.push(`file:${rel}`);
        continue;
      }
    }
    plan.unresolved.push(anchor);
  }
  return plan;
}

/**
 * O-18 (item 2): the content-hash baseline map for a set of resolved anchor ids —
 * each target's `contentHash` (the store's existing blake2b primitive, no second
 * pipeline) plus its symbol `arity`. Skips a target with no `contentHash` (a bare
 * file entity), leaving that anchor legacy. Reads resolved store entities only —
 * no git spawn, no file IO (A11).
 */
function anchorSigsFor(
  store: Store,
  anchorIds: string[],
): Record<string, { h: string; a?: number }> | undefined {
  const sigs: Record<string, { h: string; a?: number }> = {};
  for (const anchorId of anchorIds) {
    const e = store.getEntity(anchorId);
    if (!e || e.contentHash === undefined) continue;
    const arity = typeof e.attrs.arity === "number" ? e.attrs.arity : undefined;
    sigs[anchorId] = arity !== undefined ? { h: e.contentHash, a: arity } : { h: e.contentHash };
  }
  return Object.keys(sigs).length > 0 ? sigs : undefined;
}

/**
 * Deterministic near-duplicate search over EXISTING memories, scoped cheaply to
 * FTS candidates on the gist + shared-anchor overlap (per the research). Precision
 * is the entropy/number-guarded `fuzzyDuplicate` — FTS/anchors only widen recall.
 * Excludes `self` and retired entries. Returns candidate memory ids (deduped).
 */
function findDuplicateCandidates(
  store: Store,
  self: string,
  gist: string,
  anchorIds: string[],
): string[] {
  const seen = new Set<string>([self]);
  const out: string[] = [];
  const consider = (candId: string): void => {
    if (seen.has(candId)) return;
    seen.add(candId);
    const row = store.getMemory(candId); // memory-kind gate
    if (!row || row.status === "retired") return;
    if (fuzzyDuplicate(gist, row.gist).candidate) out.push(candId);
  };
  // (1) FTS recall: OR the gist's word tokens (fuzzyDuplicate is the real gate).
  const tokens = [...new Set(gist.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])];
  if (tokens.length > 0) {
    const match = tokens.map((t) => `"${t}"`).join(" OR ");
    for (const hit of store.ftsSearch(match, 20)) consider(hit.entityId);
  }
  // (2) shared-anchor overlap: memories anchored to any of the new anchors.
  for (const anchorId of anchorIds) {
    for (const l of store.linksTo(anchorId, "anchoredTo")) consider(l.src);
  }
  return out;
}

/** Emit the non-destructive sameAsCandidate claim+link+conflict between two
 *  memories (mirrors the host importer / Task 4 — dedup stays visible in BOTH
 *  the link view and the conflicts channel; never a merge). */
function fileSameAsCandidate(
  store: Store,
  a: string,
  b: string,
  gen: number,
  authority: "inferred" | "confirmed",
): void {
  const claimId = store.addClaim({
    subject: a,
    predicate: "sameAsCandidate",
    object: b,
    carrier: "remember",
    method: "semantic-proposal",
    authority,
    gen,
  });
  store.setLink({
    src: a,
    dst: b,
    predicate: "sameAsCandidate",
    method: "semantic-proposal",
    confidence: 0.5,
    claimId,
  });
  const reverseClaimId = store.addClaim({
    subject: b,
    predicate: "sameAsCandidate",
    object: a,
    carrier: "remember",
    method: "semantic-proposal",
    authority,
    gen,
  });
  store.addConflict(claimId, reverseClaimId, "sameAsCandidate");
}

export function remember(store: Store, input: RememberInput): RememberResult {
  const now = input.now ?? Date.now;
  const gist = input.note.trim();

  if (gist.length > MEMORY_GIST_MAX_CHARS) {
    return {
      ok: false,
      reason: "gist-too-long",
      gistLength: gist.length,
      guidance:
        `The note is ${gist.length} chars; a memory gist is capped at ${MEMORY_GIST_MAX_CHARS}. ` +
        `Split it: keep a ≤${MEMORY_GIST_MAX_CHARS}-char summary as the note and move the rest into \`detail\`.`,
    };
  }

  // Resolve supersedes target (must be an existing memory entity).
  let supersededId: string | undefined;
  if (input.supersedes !== undefined) {
    const resolved = store.resolveHandle(input.supersedes);
    const exists = resolved && store.getMemory(resolved.entityId);
    if (!resolved || !exists) {
      return {
        ok: false,
        reason: "unresolved-supersedes",
        guidance: `\`supersedes: ${input.supersedes}\` does not resolve to a known memory entry. Pass an existing memory id or [handle].`,
        candidates: { [input.supersedes]: candidatesFor(store, input.supersedes) },
      };
    }
    supersededId = resolved.entityId;
  }

  // Resolve anchors WITHOUT writing anything (all-or-nothing).
  const plan = planAnchors(store, input.anchors ?? []);
  if (plan.unresolved.length > 0) {
    const candidates: Record<string, EntityCandidate[]> = {};
    for (const a of plan.unresolved) candidates[a] = candidatesFor(store, a);
    return {
      ok: false,
      reason: "unresolved-anchors",
      guidance:
        `These anchors don't resolve to known entities: ${plan.unresolved.join(", ")}. ` +
        `Pass an existing entity id/[handle], anchor to a file that exists, or drop the anchor and retry.`,
      candidates,
    };
  }

  // Commit: everything resolved, write the entry in one memory generation.
  const gen = store.beginGeneration(MEMORY_SOURCE);
  for (const f of plan.toCreate) {
    store.upsertEntity({
      id: f.id,
      kind: "file",
      name: f.path,
      locator: { t: "file", path: f.path },
      gen,
    });
  }

  // S8a caller-surface split (slice 4/5): the CLI human surface lands
  // committed+active; the MCP agent surface lands overlay+needs-review (E3); the
  // `local` human surface lands overlay+active (a divergent my-view note that
  // never syncs). E4 secret guard runs on the committed (mainline) surface and
  // diverts a secret-shaped note to the overlay.
  const surface = input.surface;
  const route = ROUTE_FOR_SURFACE[surface];
  let zone: MemoryZone = route.zone;
  let status: MemoryStatus = route.status;
  const actor = route.actor;
  let remediation: string | undefined;
  if (zone === "mainline") {
    const finding = scanMemoryForSecret(gist, input.detail);
    if (finding.secret) {
      // E4: never commit a secret-shaped note. Divert to the gitignored overlay as
      // needs-review with a success-shaped remediation note (never a hard error).
      zone = "overlay";
      status = "needs-review";
      remediation = secretRemediationNote(finding.cls as string);
    }
  }
  // E4 per-repo opt-out (item 4): a repo that must not commit memory redirects a
  // Mainline write to the overlay (the MemoryFiles layer enforces the file
  // redirect; here we mirror the zone so the store event + disclosure agree). The
  // note stays `active` — it is still a human CLI note, just kept local.
  const committedZoneDisabled = zone === "mainline" && (input.files?.localOnly ?? false);
  if (committedZoneDisabled) zone = "overlay";
  // Disclosure: the note landed in the personal overlay and will never be shared
  // (chosen via `--local`, or forced by the repo opt-out).
  const localOnly = surface === "local" || committedZoneDisabled;
  // A `--local` note is marked with a never-share origin so the SHARED push digest
  // excludes it (it is deliberately divergent my-view attention, never a shared
  // artifact). The repo opt-out keeps the normal origin — its notes are ordinary
  // notes the repo happens to keep local, not per-note "never share" declarations.
  const origin: MemoryOrigin = surface === "local" ? "remember-local" : "remember";

  // C4-1 (F-D): compute `anchoredAt` BEFORE the entity write so the live entity
  // attrs carry it — `promoteCreateToMainline` reconstructs the mainline line from
  // these attrs on a pre-reindex confirm, and would otherwise read `undefined`
  // (the attrs were only rebuilt at the next full reindex). Mirrors what
  // `reindex.ingestMemoryEntry` stores.
  const anchoredAt =
    input.files && plan.resolved.length > 0 ? currentHeadCommit(store.projectRoot) : undefined;
  // O-18 (item 2): capture each resolved anchor target's content-hash baseline at
  // write time (only when file-backed — the baseline lives in the committed bytes).
  // Absent for a target with no `contentHash` (e.g. a bare file entity) → a legacy
  // anchor that degrades to today's behaviour. No git spawn / file IO (A11): reads
  // the already-resolved store entities.
  const anchorSigs = input.files ? anchorSigsFor(store, plan.resolved) : undefined;

  const id = memoryId(ulid(now()));
  store.upsertEntity({
    id,
    kind: "memory",
    name: gist.slice(0, 80),
    locator: { t: "store" },
    attrs: {
      origin,
      ...(anchoredAt ? { anchoredAt } : {}),
      ...(anchorSigs ? { anchorSigs } : {}),
    },
    gen,
  });
  store.writeMemory({
    entityId: id,
    gist,
    detail: input.detail,
    origin,
    sessionRef: input.sessionRef,
    authority: input.authority ?? "confirmed",
    status,
  });
  // S6-R2 (item 4): stamp the committed-vs-overlay provenance at the LIVE write, not
  // only at reindex — otherwise an opt-out repo that `remember`s then `push`es before
  // any reindex leaks the overlay-kept note into the digest. `zone` here is the
  // PHYSICAL zone (already redirected to overlay by the secret guard / opt-out).
  // Only when file-backed — a store-only row keeps `undefined` (includable, today's
  // behaviour). Reindex recomputes this per checkout.
  if (input.files) store.setMemoryOriginZone(id, zone);
  // The `create` event is the fold's baseline (its `refs.status` landing status).
  // Write-through: the committed line + the store event share ONE monotonic stamp,
  // so all events (create / lifecycle / drift) share one time base and total-order
  // correctly. `anchoredAt` was computed above (F-D) so the entity attrs carry it.
  recordCreate(store, input.files, zone, {
    memoryId: id,
    gist,
    detail: input.detail,
    origin,
    actor,
    carrier: MEMORY_SOURCE,
    method: "explicit-key",
    authority: input.authority ?? "confirmed",
    status,
    anchors: plan.resolved,
    anchoredAt,
    ...(anchorSigs ? { anchorSigs } : {}),
    sessionRef: input.sessionRef,
  });
  store.setAnchors(id, plan.resolved);
  for (const anchorId of plan.resolved) {
    const claimId = store.addClaim({
      subject: id,
      predicate: "anchoredTo",
      object: anchorId,
      carrier: "remember",
      method: "explicit-key",
      authority: input.authority ?? "confirmed",
      gen,
    });
    store.setLink({
      src: id,
      dst: anchorId,
      predicate: "anchoredTo",
      method: "explicit-key",
      claimId,
    });
  }
  store.ftsIndex(id, {
    name: gist.slice(0, 80),
    text: `${gist} ${input.detail ?? ""}`.trim(),
    kind: "memory",
  });

  if (supersededId !== undefined) {
    // Decision 5: supersede is an append-only decision EVENT; the old entry is
    // KEPT and its status is DERIVED from the fold, never overwritten in place.
    // Same zone/actor as the create (S8a).
    recordDecision(store, input.files, zone, {
      memoryId: supersededId,
      verb: "supersede",
      actor,
      reason: `superseded by ${id}`,
      refs: { supersededBy: id },
      carrier: MEMORY_SOURCE,
      method: "explicit-key",
      authority: input.authority ?? "confirmed",
    });
    refoldMemory(store, supersededId, gen); // fold → superseded (cache write)
    const claimId = store.addClaim({
      subject: id,
      predicate: "supersedes",
      object: supersededId,
      carrier: "remember",
      method: "explicit-key",
      authority: input.authority ?? "confirmed",
      gen,
    });
    store.setLink({
      src: id,
      dst: supersededId,
      predicate: "supersedes",
      method: "explicit-key",
      claimId,
    });
  }

  // Deterministic prewrite reconcile (D3): the write already succeeded; surface
  // (never gate) near-duplicates. A hit is linked as sameAsCandidate (both kept)
  // and — when the caller did NOT already resolve the relationship via
  // `supersedes` — returned as a supersede-candidate advisory. Never auto-applies.
  let advisory: WriteAdvisory | undefined;
  const dupCandidates = findDuplicateCandidates(store, id, gist, plan.resolved).filter(
    (candId) => candId !== supersededId,
  );
  if (dupCandidates.length > 0) {
    const authority = input.authority ?? "confirmed";
    const linked: EntityCandidate[] = [];
    for (const candId of dupCandidates) {
      fileSameAsCandidate(store, id, candId, gen, authority);
      const e = store.getEntity(candId);
      linked.push({
        entityId: candId,
        name: e?.name ?? candId,
        kind: "memory",
        handle: store.internHandle(candId),
      });
    }
    if (supersededId === undefined) {
      advisory = {
        kind: "supersede-candidate",
        guidance:
          `This note near-duplicates ${linked.length} existing ${
            linked.length === 1 ? "memory" : "memories"
          } (${linked.map((c) => `[${c.handle}]`).join(", ")}); both were kept and linked. ` +
          `If this REPLACES one, re-run with \`supersedes: <handle>\`; otherwise ignore.`,
        candidates: linked,
      };
    }
  }

  store.publishGeneration(MEMORY_SOURCE);
  const handle = displayHandle(store, id);
  return {
    ok: true,
    entityId: id,
    handle,
    gist,
    anchors: plan.resolved,
    status,
    ...(supersededId ? { supersededId } : {}),
    ...(advisory ? { advisory } : {}),
    ...(remediation ? { remediation } : {}),
    ...(localOnly ? { localOnly } : {}),
    ...(committedZoneDisabled ? { committedZoneDisabled } : {}),
  };
}

export function recall(store: Store, input: string): RecallResult {
  const resolved = store.resolveHandle(input);
  if (!resolved) {
    return {
      ok: false,
      reason: "unknown-handle",
      guidance: `\`${input}\` is not a known handle or entity id. Pass a [handle] from a context/search result or a full entity id.`,
    };
  }
  const entity = store.getEntity(resolved.entityId);
  if (!entity) {
    return { ok: false, reason: "unknown-handle", guidance: `No entity for ${resolved.entityId}.` };
  }
  const handle = store.internHandle(entity.id, resolved.facet);
  if (entity.kind === "memory") {
    const mem = store.getMemory(entity.id);
    if (!mem)
      return { ok: false, reason: "unreadable", guidance: `Memory row missing for ${entity.id}.` };
    return {
      ok: true,
      entityId: entity.id,
      kind: entity.kind,
      handle,
      gist: mem.gist,
      detail: mem.detail,
      status: mem.status,
      text: mem.detail ? `${mem.gist}\n\n${mem.detail}` : mem.gist,
    };
  }
  const rt = store.readThrough(entity.id);
  if (!rt.ok) {
    return {
      ok: false,
      reason: "unreadable",
      guidance: `Could not read ${entity.id}: ${rt.message}`,
    };
  }
  return { ok: true, entityId: entity.id, kind: entity.kind, handle, text: rt.text };
}

// ---- lifecycle listing + transitions ----

export interface MemoryListItem {
  entityId: string;
  name: string;
  gist: string;
  origin: string;
  authority: Authority; // 4-valued (R4)
  status: MemoryStatus;
  handle: string;
}

/** Map a CLI lifecycle verb to a target status. */
export const LIFECYCLE_STATUS: Record<string, MemoryStatus> = {
  confirm: "active",
  active: "active",
  retire: "retired",
  review: "needs-review",
};

/** The event verb that produces each target status (event-log write path). */
const LIFECYCLE_VERB_FOR_STATUS: Record<MemoryStatus, MemoryEventVerb> = {
  active: "confirm",
  "needs-review": "review",
  retired: "retire",
  superseded: "supersede",
};

export type LifecycleResult =
  | {
      ok: true;
      entityId: string;
      status: MemoryStatus;
      /** True when a `confirm` promoted an overlay-only create to the committed
       *  Mainline zone (S8a / slice-3 D3 close). */
      promoted?: boolean;
      /** Success-shaped E4 note when a `confirm` refused to promote a
       *  secret-shaped body to the committed zone (kept in the overlay). */
      remediation?: string;
      /** Slice 5: the decision was recorded in the personal overlay and nothing was
       *  promoted/committed. True for BOTH an E4 repo opt-out AND a `--local`
       *  (origin `remember-local`) note that is never shared (F-G). */
      localOnly?: boolean;
      /** Slice 5 (F-G): distinguishes the E4 repo opt-out (this repo commits no
       *  memory) from a `--local` note kept local, so the CLI discloses the right
       *  reason. Present only when the repo opted out. */
      committedZoneDisabled?: boolean;
    }
  | { ok: false; reason: "unknown-handle" | "not-memory"; guidance: string };

/**
 * Promote an overlay-only memory's `create` body to the committed Mainline zone
 * (slice-4 item 4 / closes slice-3 D3): reconstruct the `mem` line (+ its detail
 * sidecar) from the store using the ORIGINAL create event id/at, and append it to
 * the mainline log. On reindex the mainline create wins over the leftover overlay
 * line (F6 mainline-wins → `shadowedOverlay`), so the stale overlay line stays
 * (append-only) but is deterministically shadowed. E3 is satisfied: a human
 * `confirm` is the act that authorizes the committed zone.
 */
function promoteCreateToMainline(store: Store, files: MemoryFiles, memId: string): boolean {
  const mem = store.getMemory(memId);
  const create = store.memoryEvents(memId).find((e) => e.verb === "create");
  // Unreachable by construction today (migration 002 F1 backfill + the claudeImporter
  // guard guarantee every memory has exactly one create event). If it ever were
  // reachable, we MUST NOT report a promotion — the caller routes the confirm dec
  // to the overlay instead, so no committed `dec` line dangles on an unpromoted id
  // (the exact D3 defect this slice closes).
  if (!mem || !create) return false;
  const attrs = store.getEntity(memId)?.attrs;
  const anchoredAt = typeof attrs?.anchoredAt === "string" ? attrs.anchoredAt : undefined;
  const anchorSigs =
    attrs?.anchorSigs && typeof attrs.anchorSigs === "object"
      ? (attrs.anchorSigs as Record<string, { h: string; a?: number }>)
      : undefined;
  const status =
    typeof create.refs.status === "string" ? (create.refs.status as MemoryStatus) : mem.status;
  files.appendMemory(
    "mainline",
    {
      eventId: create.id,
      at: create.at,
      memoryId: memId,
      actor: create.actor,
      carrier: create.carrier,
      method: create.method,
      authority: create.authority,
      status,
      gist: mem.gist,
      origin: mem.origin,
      detailPointer: mem.detail ? ulidOf(memId) : undefined,
      anchors: store.anchorsOf(memId),
      anchoredAt,
      ...(anchorSigs ? { anchorSigs } : {}),
      sessionRef: mem.sessionRef,
      reason: create.reason,
      validFrom: mem.validFrom,
      validTo: mem.validTo,
    },
    mem.detail,
  );
  return true;
}

export function setMemoryLifecycle(
  store: Store,
  idOrHandle: string,
  status: MemoryStatus,
  files?: MemoryFiles,
): LifecycleResult {
  const resolved = store.resolveHandle(idOrHandle);
  if (!resolved) {
    return {
      ok: false,
      reason: "unknown-handle",
      guidance: `\`${idOrHandle}\` is not a known handle or entity id.`,
    };
  }
  if (!store.getMemory(resolved.entityId)) {
    return {
      ok: false,
      reason: "not-memory",
      guidance: `\`${resolved.entityId}\` is not a memory entry.`,
    };
  }
  // A4: lifecycle is a human/CLI decision — recorded as an append-only EVENT;
  // the status is DERIVED by the fold, never overwritten in place (Decision 5).
  // Write-through: CLI/human decisions → the committed MAINLINE zone (E3:
  // committed = human-authored or human-confirmed).
  const memId = resolved.entityId;
  const gen = store.publishedGen(MEMORY_SOURCE);
  // Item 4 — `confirm` PROMOTES an overlay-only create to the committed Mainline
  // zone (closes slice-3 D3: a mainline `dec` line no longer references an id no
  // peer has). E4 runs first: a secret-shaped body is NEVER promoted — it stays in
  // the gitignored overlay and the confirm decision is written there too, so no
  // dangling mainline `dec` line and nothing sensitive enters git.
  let zone: MemoryZone = "mainline";
  let promoted = false;
  let remediation: string | undefined;
  // E4 opt-out (item 4): a repo that must not commit memory never promotes to the
  // committed zone — the confirm decision is recorded in the overlay (the
  // MemoryFiles layer redirects the write; here we skip the promotion attempt so
  // no create body is reconstructed into a Mainline-shaped line at all).
  const committedZoneDisabled = files?.localOnly ?? false;
  // C5-1 (F-G): a `--local` note (origin `remember-local`) is NEVER shared — a
  // confirm must not promote it to the committed zone. Route its confirm dec (and
  // the F-E resolution decs below) to the personal overlay, same shape as the
  // secret divert. Guarded by origin regardless of the repo opt-out state.
  const isLocalNote = store.getMemory(memId)?.origin === "remember-local";
  if (isLocalNote) {
    zone = "overlay";
  } else if (status === "active" && files && !committedZoneDisabled) {
    const inMainline = files.readMemories("mainline").some((m) => m.memoryId === memId);
    if (!inMainline) {
      const mem = store.getMemory(memId);
      const finding = scanMemoryForSecret(mem?.gist ?? "", mem?.detail);
      if (finding.secret) {
        zone = "overlay"; // E4: keep the secret out of the committed zone
        remediation = secretRemediationNote(finding.cls as string);
      } else if (promoteCreateToMainline(store, files, memId)) {
        promoted = true;
      } else {
        // Promotion could not reconstruct the create body (unreachable today).
        // Route the confirm dec to the overlay so no committed `dec` line dangles
        // on an unpromoted overlay-only id (the D3 defect this slice closes).
        zone = "overlay";
      }
    }
  }
  // Disclosure (F-G): local for EITHER an E4 opt-out OR a `--local` note.
  const localOnly = committedZoneDisabled || isLocalNote;
  // R9: a `confirm` that clears a drift must carry, IN THE COMMITTED BYTES, which
  // drift class it cleared (`clearedDrift`) and the HEAD it judged that absence
  // against (`confirmedAt`, mirror of anchored-at). A full reindex reads these to
  // avoid re-deriving `target-removed` and undoing the human's E7-recovery on
  // every checkout. A confirm made while the target was PRESENT carries no
  // `clearedDrift`, so a later real removal still flags on every machine.
  const clearedDrift =
    status === "active" ? (store.getMemory(memId)?.driftReason ?? undefined) : undefined;
  const confirmedAt =
    status === "active" && files ? currentHeadCommit(store.projectRoot) : undefined;
  // S6-R1 (O-18 confirm side): a `confirm` clearing a PRESENT-target drift
  // (signature/body-changed) must record, IN THE COMMITTED BYTES, the CURRENT
  // signatures of the anchored targets it judged — otherwise a full reindex keeps
  // comparing the current target to the STALE write-time baseline and re-undoes the
  // human's E7-recovery on every checkout (the R9 defect, resurrected for the two
  // present-target classes). `recomputeDriftAtReindex` suppresses re-deriving a
  // present anchor's drift when the target's current signature equals the confirmed
  // one; a later change (current ≠ confirmed) re-derives. Deterministic from
  // committed bytes + the current index — no ancestry check for the present case.
  const confirmSigs =
    status === "active" && files ? anchorSigsFor(store, store.anchorsOf(memId)) : undefined;
  const confirmRefs: Record<string, unknown> = {};
  if (clearedDrift) confirmRefs.clearedDrift = clearedDrift;
  if (confirmedAt) confirmRefs.confirmedAt = confirmedAt;
  if (confirmSigs) confirmRefs.confirmSigs = confirmSigs;
  recordDecision(store, files, zone, {
    memoryId: memId,
    verb: LIFECYCLE_VERB_FOR_STATUS[status],
    actor: "cli",
    carrier: "cli",
    method: "explicit-key",
    authority: "confirmed",
    refs: Object.keys(confirmRefs).length > 0 ? confirmRefs : undefined,
  });
  // `confirm` (→ active) is the recovery verb: the human re-affirms the note, so
  // the derived drift annotation is cleared (freshness affirmed) and its open
  // stale-suspect conflicts resolve — each resolution is ITSELF an append-only
  // decision event carrying the conflict reference (C4). Idempotent for an
  // already-active row (the body-changed drift case: no fold flip, just clears
  // the flag). The `stale-reason` claims are untouched — the permanent audit
  // trail. `retire` leaves conflicts as-is (retired is status-gated everywhere).
  if (status === "active") {
    store.setMemoryDrift(memId, null);
    for (const c of store.openStaleSuspects(memId)) {
      // F-E: the resolution dec follows the confirm's zone (overlay for a
      // secret-diverted / unpromoted / `--local` confirm), never a dangling
      // committed line referencing an id no peer has.
      resolveConflictViaEvent(store, memId, c.a, c.b, "resolve-conflict", "cli", files, zone);
    }
  }
  // S6-R2 (item 4): a confirm that PROMOTED the create to the committed Mainline
  // zone must update the provenance immediately, so the just-promoted note is
  // push-eligible without waiting for the next reindex. A secret/`--local`/opt-out
  // divert keeps the create in the overlay → leave the zone as-is.
  if (promoted) store.setMemoryOriginZone(memId, "mainline");
  const effective = refoldMemory(store, memId, gen);
  return {
    ok: true,
    entityId: memId,
    status: effective,
    ...(promoted ? { promoted } : {}),
    ...(remediation ? { remediation } : {}),
    ...(localOnly ? { localOnly } : {}),
    ...(committedZoneDisabled ? { committedZoneDisabled } : {}),
  };
}

/**
 * Enumerate memory entries (lifecycle CLI + tests). A6: reads through the
 * store's own `listMemoryEntries` seam — no second read-only SQLite connection.
 */
export function listMemories(store: Store, opts: { status?: MemoryStatus } = {}): MemoryListItem[] {
  return store.listMemoryEntries(opts.status).map((r) => ({
    entityId: r.entityId,
    name: r.name,
    gist: r.gist,
    origin: r.origin,
    authority: r.authority,
    status: r.status,
    handle: r.handle ?? shortHandleCandidate(r.entityId, undefined, 5),
  }));
}
