/**
 * M3 guide — projection builders (brief §2/§3). Pure, in-process, READ-ONLY
 * projections over the store + selection engine. Never mint handles (internHandle
 * writes — G-readonly): drill keys are entity ids; a short handle is used only when
 * a read already returns one. Every fact embeds an `EvidencePacket`; every
 * projection discloses its budget's omissions (G-budget).
 */
import type { Store } from "../store/store.ts";
import type { Entity, EntityKind } from "../store/types.ts";
import { search as selectSearch } from "../select/engine.ts";
import { claimEnvelopeFor, ACCELERATOR_DISCLOSURE } from "../serve/envelope.ts";
import { buildPushBlock, PUSH_MAX_BYTES } from "../push/block.ts";
import { readMergedPushConfig } from "../push/push.ts";
import { evidencePacket } from "./glyphs.ts";
import type {
  BudgetDisclosure,
  CanvasProjection,
  CanvasSourceStat,
  ChurnLensProjection,
  ConflictGroup,
  GuidedFact,
  InspectorProjection,
  ProjectionBudget,
  ProjectionMeta,
  SearchProjection,
  SubjectProjection,
  TimeLensProjection,
  NeighborhoodNode,
  NeighborhoodEdge,
} from "./types.ts";

/** Entity kinds enumerated (store has no all-entities read; we scan by kind). */
export const ALL_KINDS: readonly EntityKind[] = [
  "symbol",
  "file",
  "module",
  "commit",
  "pr",
  "issue",
  "decision",
  "doc_section",
  "story",
  "meeting",
  "memory",
  "concept",
];

/** Which ingest source a kind is attributed to (coverage buckets, canvas §3.1). */
const KIND_SOURCE: Record<EntityKind, string> = {
  symbol: "code",
  file: "code",
  module: "code",
  commit: "git",
  pr: "git",
  issue: "git",
  decision: "docs",
  doc_section: "docs",
  story: "docs",
  meeting: "docs",
  concept: "docs",
  memory: "memory",
};
export const GUIDE_SOURCES = ["code", "git", "docs", "memory"] as const;

function meta(now: number): ProjectionMeta {
  return { disclosure: ACCELERATOR_DISCLOSURE, generatedAt: now };
}

function disclose(
  budget: ProjectionBudget,
  omittedByReason: Record<string, number>,
): BudgetDisclosure {
  const omitted = Object.values(omittedByReason).reduce((a, b) => a + b, 0);
  return { budget, omitted, omittedByReason };
}

/** Read-only handle: never mint. Fall back to the entity id (a valid drill key). */
function drillKey(entity: Entity): string {
  return entity.id;
}

function evidenceFor(store: Store, entity: Entity): ReturnType<typeof evidencePacket> {
  return evidencePacket(claimEnvelopeFor(store, entity));
}

// ---- Canvas ----

const CANVAS_BUDGET: ProjectionBudget = {
  edgePredicates: ["touches", "co-changed", "contains", "references"],
  depth: 1,
  nodeCap: 12, // members previewed per cluster
};

export function buildCanvasProjection(store: Store, now: number): CanvasProjection {
  const byKind = new Map<EntityKind, Entity[]>();
  let total = 0;
  for (const kind of ALL_KINDS) {
    const ents = store.entitiesByKind(kind);
    if (ents.length > 0) byKind.set(kind, ents);
    total += ents.length;
  }

  // Per-source stats (coverage + gen/cursor).
  const sourceCount = new Map<string, number>();
  for (const [kind, ents] of byKind) {
    const src = KIND_SOURCE[kind];
    sourceCount.set(src, (sourceCount.get(src) ?? 0) + ents.length);
  }
  const sources: CanvasSourceStat[] = GUIDE_SOURCES.map((source) => {
    const cursor = store.getCursor(source);
    const count = sourceCount.get(source) ?? 0;
    return {
      source,
      entityCount: count,
      publishedGen: store.publishedGen(source),
      ...(cursor?.position !== undefined ? { cursorPosition: cursor.position } : {}),
      ...(cursor?.freshness !== undefined ? { cursorFreshness: cursor.freshness } : {}),
      coverage: total > 0 ? count / total : 0,
    };
  });

  // Clusters by kind, bounded member preview.
  const omittedByReason: Record<string, number> = {};
  const clusters = [...byKind.entries()].map(([kind, ents]) => {
    const members = ents.slice(0, CANVAS_BUDGET.nodeCap).map((e) => ({
      entityId: e.id,
      name: e.name,
      handle: drillKey(e),
      evidence: evidenceFor(store, e),
    }));
    const dropped = ents.length - members.length;
    if (dropped > 0) omittedByReason["node-cap"] = (omittedByReason["node-cap"] ?? 0) + dropped;
    return { id: `cluster:${kind}`, label: kind, kind, size: ents.length, members };
  });

  // Hot areas: entities ranked by touch/co-change degree (churn seed). Bounded.
  const heatCandidates: Entity[] = [
    ...(byKind.get("file") ?? []),
    ...(byKind.get("symbol") ?? []),
  ].slice(0, 400);
  const hot = heatCandidates
    .map((e) => {
      const heat =
        store.linksFrom(e.id, "co-changed").length +
        store.linksTo(e.id, "co-changed").length +
        store.linksTo(e.id, "touches").length;
      return { entityId: e.id, name: e.name, handle: drillKey(e), heat };
    })
    .filter((h) => h.heat > 0)
    .sort((a, b) => b.heat - a.heat)
    .slice(0, 10);

  const needsReview = store.listMemoryEntries("needs-review").length;
  const openConflicts = store.conflicts("open").length;
  const e8StaleSources = sources.filter((s) => s.cursorPosition === undefined).map((s) => s.source);

  return {
    kind: "canvas",
    meta: meta(now),
    sources,
    clusters,
    hotAreas: hot,
    badges: { needsReview, openConflicts, e8StaleSources, perSource: sources },
    budget: disclose(CANVAS_BUDGET, omittedByReason),
  };
}

// ---- Time lens (supersession/decision overlay) ----

const LENS_BUDGET: ProjectionBudget = {
  edgePredicates: ["supersedes", "co-changed"],
  depth: 1,
  nodeCap: 200,
};

export function buildTimeLensProjection(store: Store, now: number): TimeLensProjection {
  const chains: TimeLensProjection["chains"] = [];
  const omittedByReason: Record<string, number> = {};
  for (const mem of store.allMemories()) {
    const from = store.getEntity(mem.entityId);
    if (!from) continue;
    for (const link of store.linksFrom(mem.entityId, "supersedes")) {
      const to = store.getEntity(link.dst);
      if (!to) continue;
      if (chains.length >= LENS_BUDGET.nodeCap) {
        omittedByReason["node-cap"] = (omittedByReason["node-cap"] ?? 0) + 1;
        continue;
      }
      chains.push({
        from: from.id,
        to: to.id,
        fromName: from.name,
        toName: to.name,
        predicate: "supersedes",
        at: from.lastVerified,
      });
    }
  }
  chains.sort((a, b) => a.at - b.at);
  return {
    kind: "time-lens",
    meta: meta(now),
    chains,
    budget: disclose(LENS_BUDGET, omittedByReason),
  };
}

// ---- Churn lens (co-change clusters) ----

export function buildChurnLensProjection(store: Store, now: number): ChurnLensProjection {
  const seen = new Set<string>();
  const clusters: ChurnLensProjection["clusters"] = [];
  const omittedByReason: Record<string, number> = {};
  const files = store.entitiesByKind("file");
  for (const f of files) {
    if (seen.has(f.id)) continue;
    const partners = store.linksFrom(f.id, "co-changed");
    if (partners.length === 0) continue;
    const members = [{ entityId: f.id, name: f.name, handle: drillKey(f) }];
    let support = 0;
    for (const p of partners) {
      const pe = store.getEntity(p.dst);
      if (!pe) continue;
      seen.add(pe.id);
      support += p.confidence;
      if (members.length < LENS_BUDGET.nodeCap) {
        members.push({ entityId: pe.id, name: pe.name, handle: drillKey(pe) });
      } else {
        omittedByReason["node-cap"] = (omittedByReason["node-cap"] ?? 0) + 1;
      }
    }
    seen.add(f.id);
    clusters.push({ members, support });
  }
  clusters.sort((a, b) => b.support - a.support);
  return {
    kind: "churn-lens",
    meta: meta(now),
    clusters,
    budget: disclose(LENS_BUDGET, omittedByReason),
  };
}

// ---- Subject ----

const SUBJECT_BUDGET: ProjectionBudget = {
  edgePredicates: ["calls", "references", "contains", "touches", "co-changed", "supersedes"],
  depth: 1,
  nodeCap: 24,
};

/** Resolve a ref (entity id / short handle / name) to an entity — read-only. */
export function resolveSubject(store: Store, ref: string): Entity | undefined {
  const direct = store.getEntity(ref);
  if (direct) return direct;
  const viaHandle = store.resolveHandle(ref);
  if (viaHandle) {
    const e = store.getEntity(viaHandle.entityId);
    if (e) return e;
  }
  const byName = store.entitiesByName(ref, 1);
  return byName[0];
}

export function buildSubjectProjection(
  store: Store,
  ref: string,
  now: number,
): SubjectProjection | undefined {
  const subject = resolveSubject(store, ref);
  if (!subject) return undefined;
  const omittedByReason: Record<string, number> = {};

  // Facts: outgoing relationships (predicate → target), each provenance-resolvable.
  const facts: GuidedFact[] = [];
  for (const link of store.linksFrom(subject.id)) {
    const dst = store.getEntity(link.dst);
    if (!dst) continue;
    if (facts.length >= SUBJECT_BUDGET.nodeCap) {
      omittedByReason["node-cap"] = (omittedByReason["node-cap"] ?? 0) + 1;
      continue;
    }
    facts.push({
      label: link.predicate,
      value: dst.name,
      handle: drillKey(dst),
      entityId: dst.id,
      evidence: evidenceFor(store, dst),
    });
  }
  // Attribute facts (declared metadata) — resolvable to the subject's own envelope.
  const subjectEvidence = evidenceFor(store, subject);
  for (const [k, v] of Object.entries(subject.attrs)) {
    if (facts.length >= SUBJECT_BUDGET.nodeCap * 2) break;
    facts.push({ label: k, value: String(v), evidence: subjectEvidence });
  }

  // Decision chain: memory lifecycle events + supersedes edges.
  const decisionChain: SubjectProjection["decisionChain"] = [];
  if (subject.kind === "memory") {
    for (const ev of store.memoryEvents(subject.id)) {
      decisionChain.push({
        entityId: subject.id,
        name: subject.name,
        handle: drillKey(subject),
        verb: ev.verb,
        at: ev.at,
        ...(ev.reason !== undefined ? { reason: ev.reason } : {}),
        evidence: subjectEvidence,
      });
    }
  }
  for (const link of store.linksFrom(subject.id, "supersedes")) {
    const to = store.getEntity(link.dst);
    if (!to) continue;
    decisionChain.push({
      entityId: to.id,
      name: to.name,
      handle: drillKey(to),
      verb: "supersedes",
      at: subject.lastVerified,
      evidence: evidenceFor(store, to),
    });
  }

  // History / co-change (subject-scoped).
  const history: SubjectProjection["history"] = [];
  for (const predicate of ["touches", "co-changed"] as const) {
    for (const link of store.linksTo(subject.id, predicate)) {
      const src = store.getEntity(link.src);
      if (!src) continue;
      history.push({
        entityId: src.id,
        name: src.name,
        handle: drillKey(src),
        predicate,
        confidence: link.confidence,
      });
    }
    for (const link of store.linksFrom(subject.id, predicate)) {
      const dst = store.getEntity(link.dst);
      if (!dst) continue;
      history.push({
        entityId: dst.id,
        name: dst.name,
        handle: drillKey(dst),
        predicate,
        confidence: link.confidence,
      });
    }
  }

  // Bounded neighborhood mini-graph (depth 1).
  const nodes: NeighborhoodNode[] = [
    {
      entityId: subject.id,
      name: subject.name,
      kind: subject.kind,
      handle: drillKey(subject),
      depth: 0,
    },
  ];
  const edges: NeighborhoodEdge[] = [];
  const seen = new Set<string>([subject.id]);
  for (const predicate of SUBJECT_BUDGET.edgePredicates) {
    for (const link of store.linksFrom(subject.id, predicate)) {
      const n = store.getEntity(link.dst);
      if (!n) continue;
      edges.push({ src: subject.id, dst: n.id, predicate, confidence: link.confidence });
      if (!seen.has(n.id) && nodes.length < SUBJECT_BUDGET.nodeCap) {
        seen.add(n.id);
        nodes.push({ entityId: n.id, name: n.name, kind: n.kind, handle: drillKey(n), depth: 1 });
      }
    }
    for (const link of store.linksTo(subject.id, predicate)) {
      const n = store.getEntity(link.src);
      if (!n) continue;
      edges.push({ src: n.id, dst: subject.id, predicate, confidence: link.confidence });
      if (!seen.has(n.id) && nodes.length < SUBJECT_BUDGET.nodeCap) {
        seen.add(n.id);
        nodes.push({ entityId: n.id, name: n.name, kind: n.kind, handle: drillKey(n), depth: 1 });
      }
    }
  }

  return {
    kind: "subject",
    meta: meta(now),
    subject: {
      entityId: subject.id,
      kind: subject.kind,
      name: subject.name,
      handle: drillKey(subject),
    },
    evidence: subjectEvidence,
    facts,
    decisionChain,
    history,
    neighborhood: { nodes, edges },
    budget: disclose(SUBJECT_BUDGET, omittedByReason),
  };
}

// ---- Inspector ----

const INSPECTOR_BUDGET: ProjectionBudget = {
  edgePredicates: [],
  depth: 0,
  nodeCap: 500,
};

export function buildInspectorProjection(store: Store, now: number): InspectorProjection {
  const omittedByReason: Record<string, number> = {};

  // Review queue → exact CLI command per needs-review note.
  const reviewRows = store.listMemoryEntries("needs-review");
  const reviewQueue = reviewRows.slice(0, INSPECTOR_BUDGET.nodeCap).map((r) => {
    const e = store.getEntity(r.entityId);
    const id = r.handle ?? r.entityId;
    return {
      entityId: r.entityId,
      handle: r.handle ?? r.entityId,
      gist: r.gist,
      cliCommand: `ctx memory confirm ${id}`,
      evidence: e
        ? evidenceFor(store, e)
        : evidencePacket(claimEnvelopeFor(store, fauxEntity(r.entityId, r.name))),
    };
  });

  // Conflicts grouped by reason class (state, not events).
  const groups = new Map<string, ConflictGroup>();
  for (const c of store.conflicts("open")) {
    const ca = store.getClaim(c.a);
    const cb = store.getClaim(c.b);
    const subjectA = ca?.subject ?? String(c.a);
    const subjectB = cb?.subject ?? String(c.b);
    const g = groups.get(c.kind) ?? { reasonClass: c.kind, items: [] };
    g.items.push({
      a: c.a,
      b: c.b,
      subjectA,
      subjectB,
      cliCommand: `ctx memory confirm ${subjectA}`,
    });
    groups.set(c.kind, g);
  }

  // Push preview — verbatim would-be digest + budget (display only).
  const push = buildPushBlock(store, { includeGotchas: true });
  const cfg = readMergedPushConfig(store.projectRoot);
  const pushPreview = {
    digestText: push.text,
    bytes: push.bytes,
    budgetBytes: PUSH_MAX_BYTES,
    pins: cfg.pin,
    vetoes: cfg.veto,
    omittedGotchas: push.omittedGotchas,
  };

  // Memory browser: zones + origin + lifecycle chains.
  const zones = { mainline: 0, overlay: 0, unknown: 0 };
  const entries = store.allMemories().map((m) => {
    const e = store.getEntity(m.entityId);
    const zone: "mainline" | "overlay" | "unknown" = m.originZone ?? "unknown";
    zones[zone] += 1;
    return {
      entityId: m.entityId,
      handle: m.entityId,
      name: e?.name ?? m.entityId,
      gist: m.gist,
      origin: m.origin,
      zone,
      status: m.status,
      lifecycle: store.memoryEvents(m.entityId).map((ev) => ({
        verb: ev.verb,
        actor: ev.actor,
        at: ev.at,
        ...(ev.reason !== undefined ? { reason: ev.reason } : {}),
      })),
      evidence: e
        ? evidenceFor(store, e)
        : evidencePacket(claimEnvelopeFor(store, fauxEntity(m.entityId, m.gist))),
    };
  });

  // Health: per-source gen/cursor/freshness + E8 stale.
  const sources = GUIDE_SOURCES.map((source) => {
    const cursor = store.getCursor(source);
    return {
      source,
      publishedGen: store.publishedGen(source),
      ...(cursor?.position !== undefined ? { cursorPosition: cursor.position } : {}),
      ...(cursor?.freshness !== undefined ? { cursorFreshness: cursor.freshness } : {}),
      stale: cursor?.position === undefined,
    };
  });

  return {
    kind: "inspector",
    meta: meta(now),
    reviewQueue,
    conflicts: [...groups.values()],
    pushPreview,
    memoryBrowser: { zones, entries },
    health: {
      sources,
      needsReview: reviewRows.length,
      openConflicts: store.conflicts("open").length,
    },
    budget: disclose(INSPECTOR_BUDGET, omittedByReason),
  };
}

/** A minimal Entity shell for an id we could not load (evidence still resolvable). */
function fauxEntity(id: string, name: string): Entity {
  return {
    id,
    kind: "memory",
    name,
    locator: { t: "store" },
    contentHash: undefined,
    sourceRev: undefined,
    attrs: {},
    firstSeen: 0,
    lastVerified: 0,
    gen: 0,
  };
}

// ---- Search (omnibox) ----

const SEARCH_BUDGET: ProjectionBudget = {
  edgePredicates: [],
  depth: 0,
  nodeCap: 40,
};

export function buildSearchProjection(
  store: Store,
  query: string,
  kinds: EntityKind[] | null,
  now: number,
): SearchProjection {
  const omittedByReason: Record<string, number> = {};
  const result = selectSearch(store, {
    query,
    ...(kinds !== null ? { kinds } : {}),
    now: () => now,
  });
  const hits = result.items.slice(0, SEARCH_BUDGET.nodeCap).map((item) => {
    const e = store.getEntity(item.entityId);
    return {
      entityId: item.entityId,
      kind: item.kind,
      name: item.name,
      handle: e ? drillKey(e) : item.entityId,
      evidence: e
        ? evidenceFor(store, e)
        : evidencePacket(claimEnvelopeFor(store, fauxEntity(item.entityId, item.name))),
    };
  });
  const dropped = result.items.length - hits.length + result.omitted.length;
  if (dropped > 0) omittedByReason["node-cap"] = dropped;
  return {
    kind: "search",
    meta: meta(now),
    query,
    kinds,
    hits,
    budget: disclose(SEARCH_BUDGET, omittedByReason),
  };
}
