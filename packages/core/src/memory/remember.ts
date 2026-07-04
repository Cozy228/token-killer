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
import { DatabaseSync } from "node:sqlite";
import { shortHandleCandidate } from "../store/handles.ts";
import type { Store } from "../store/store.ts";
import type { EntityKind, Facet, MemoryStatus } from "../store/types.ts";
import { MEMORY_GIST_MAX_CHARS } from "./claudeImporter.ts";
import { ulid, memoryId } from "./ulid.ts";

const MEMORY_SOURCE = "memory";

export interface RememberInput {
  note: string;
  detail?: string;
  anchors?: string[];
  supersedes?: string;
  sessionRef?: string;
  /** User/agent assertions are `confirmed` by default (they carry authority). */
  authority?: "inferred" | "confirmed";
  now?: () => number;
}

export interface EntityCandidate {
  entityId: string;
  name: string;
  kind: EntityKind;
  handle: string;
}

export type RememberResult =
  | {
      ok: true;
      entityId: string;
      handle: string;
      gist: string;
      anchors: string[];
      supersededId?: string;
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

  const id = memoryId(ulid(now()));
  store.upsertEntity({
    id,
    kind: "memory",
    name: gist.slice(0, 80),
    locator: { t: "store" },
    attrs: { origin: "remember" },
    gen,
  });
  store.writeMemory({
    entityId: id,
    gist,
    detail: input.detail,
    origin: "remember",
    sessionRef: input.sessionRef,
    authority: input.authority ?? "confirmed",
    status: "active",
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
    store.setMemoryStatus(supersededId, "superseded"); // old entry KEPT, just re-statused
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

  store.publishGeneration(MEMORY_SOURCE);
  const handle = displayHandle(store, id);
  return {
    ok: true,
    entityId: id,
    handle,
    gist,
    anchors: plan.resolved,
    ...(supersededId ? { supersededId } : {}),
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
  authority: "inferred" | "confirmed";
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

export type LifecycleResult =
  | { ok: true; entityId: string; status: MemoryStatus }
  | { ok: false; reason: "unknown-handle" | "not-memory"; guidance: string };

export function setMemoryLifecycle(
  store: Store,
  idOrHandle: string,
  status: MemoryStatus,
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
  store.setMemoryStatus(resolved.entityId, status);
  return { ok: true, entityId: resolved.entityId, status };
}

/**
 * Enumerate memory entries (lifecycle CLI + tests). Read-only: opens a second
 * read-only connection on the store's WAL db (the store owns the writer), so it
 * needs no enumeration method on the pinned foundation `Store` interface.
 */
export function listMemories(store: Store, opts: { status?: MemoryStatus } = {}): MemoryListItem[] {
  // A second connection on the store's WAL db (readers never block writers);
  // this function only ever SELECTs, matching the 1b test's reader pattern.
  const db = new DatabaseSync(store.dbPath);
  db.exec("PRAGMA busy_timeout=5000");
  try {
    const publishedGen =
      (
        db
          .prepare("SELECT COALESCE(published_gen, 0) AS g FROM generations WHERE source = ?")
          .get(MEMORY_SOURCE) as { g: number } | undefined
      )?.g ?? 0;
    const sql =
      `SELECT m.entity_id AS entityId, e.name AS name, m.gist AS gist, m.origin AS origin,
              m.authority AS authority, m.status AS status,
              (SELECT short FROM handles h WHERE h.entity_id = m.entity_id AND h.facet IS NULL LIMIT 1) AS handle
       FROM memory m JOIN entities e ON e.id = m.entity_id
       WHERE e.gen <= ?` +
      (opts.status ? " AND m.status = ?" : "") +
      " ORDER BY e.last_verified DESC, m.entity_id";
    const params: Array<string | number> = opts.status
      ? [publishedGen, opts.status]
      : [publishedGen];
    const rows = db.prepare(sql).all(...params) as Array<
      Omit<MemoryListItem, "handle"> & { handle: string | null }
    >;
    return rows.map((r) => ({
      ...r,
      handle: r.handle ?? shortHandleCandidate(r.entityId, undefined, 5),
    }));
  } finally {
    db.close();
  }
}
