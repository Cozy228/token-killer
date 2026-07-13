// Event Projection primitive (D22/D23/D25). PURE + deterministic.
//
//   project(event, atlas) -> { lit nodes, lit observed edges, viewport, rail }
//
// An event carries HARD anchors only (diff range / exact file / exact symbol).
// Open-concept queries are NOT events and are rejected with a disclosed reason.
// Same event + same AtlasModel => byte-identical projection JSON (golden test).

import { ancestors, fileId } from "./compile.js";
import type {
  AtlasEdge,
  AtlasModel,
  AtlasNode,
  CorpusInput,
  EventProjection,
  ProjectableEvent,
  RailGroup,
  RailStep,
  ResolvedEvent,
  Viewport,
} from "./types.js";
import { accumulateClaims, emptyClaimAccumulator, finalizeClaimSet } from "./types.js";

const HEX = /^[0-9a-f]{7,40}$/;
const VIEWPORT_PAD = 4;
/**
 * Max directly-observed 1-hop neighbors added per anchor (D32 real expansion).
 * Beyond this the neighbor edge is dropped and counted in `omittedNeighborCount`
 * — a bounded, disclosed projection rather than the anchor-induced hairball.
 */
const NEIGHBOR_CAP_PER_ANCHOR = 8;

/** Strip an optional `commit:` prefix from a diff endpoint. */
function normHex(raw: string): string {
  return raw
    .trim()
    .replace(/^commit:/, "")
    .toLowerCase();
}

/**
 * Resolve a URL query into a projectable event, or a typed rejection.
 * Hard anchors only; `q=` (open-concept) is rejected by design (U13/D22).
 */
export function resolveEvent(
  query: { diff?: string; sym?: string; q?: string },
  corpus: CorpusInput,
): ResolvedEvent {
  if (query.q !== undefined && query.q !== "" && !query.diff && !query.sym) {
    return { ok: false, reason: "open-concept queries are not events; use search" };
  }
  if (query.sym) {
    return {
      ok: true,
      event: {
        kind: "diff",
        label: query.sym,
        from: "",
        to: "",
        anchorFiles: [],
        anchorSyms: [query.sym],
      },
    };
  }
  if (query.diff) {
    const parts = query.diff.split("..");
    if (parts.length !== 2) {
      return { ok: false, reason: "malformed diff range; expected <from>..<to>" };
    }
    const from = normHex(parts[0]);
    const to = normHex(parts[1]);
    if (!HEX.test(from) || !HEX.test(to)) {
      return { ok: false, reason: "malformed diff range; each side must be 7-40 hex characters" };
    }
    const cf = normHex(corpus.event.range.from);
    const ct = normHex(corpus.event.range.to);
    if (from !== cf || to !== ct) {
      return {
        ok: false,
        reason:
          "diff range is not present in the loaded corpus; regenerate the corpus for this range",
      };
    }
    return {
      ok: true,
      event: {
        kind: "diff",
        label: corpus.event.label,
        from: corpus.event.range.from,
        to: corpus.event.range.to,
        anchorFiles: [...corpus.event.anchorFiles],
        anchorSyms: [...corpus.event.anchorSyms],
      },
    };
  }
  // Default: the corpus's own diff event ("what changed recently", D10/D22).
  return {
    ok: true,
    event: {
      kind: "diff",
      label: corpus.event.label,
      from: corpus.event.range.from,
      to: corpus.event.range.to,
      anchorFiles: [...corpus.event.anchorFiles],
      anchorSyms: [...corpus.event.anchorSyms],
    },
  };
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * Resolve raw anchors to atlas node ids that exist in the model. With D33 kernel
 * completeness most symbol anchors resolve to their decl node; where one still
 * cannot, it is DOWNGRADED to its containing file lot and counted (disclosed,
 * never silent — the old behaviour hid 219 of 227 default-event symbols).
 */
function resolveAnchorNodes(
  event: ProjectableEvent,
  model: AtlasModel,
): { anchors: Set<string>; downgrades: number } {
  const anchors = new Set<string>();
  let downgrades = 0;
  for (const f of event.anchorFiles) {
    if (model.nodeIndex.has(f)) anchors.add(f);
  }
  for (const s of event.anchorSyms) {
    if (model.nodeIndex.has(s)) {
      anchors.add(s);
      continue;
    }
    // Fall back to the containing file lot when the decl is not an atlas atom.
    const parent = fileId(s.startsWith("sym:") ? s.slice(4).split("#")[0] : s);
    if (model.nodeIndex.has(parent)) {
      anchors.add(parent);
      downgrades++;
    }
  }
  return { anchors, downgrades };
}

export function project(event: ProjectableEvent, model: AtlasModel): EventProjection {
  const { anchors: anchorSet, downgrades } = resolveAnchorNodes(event, model);

  // An id "resolves" to the event if it or an ancestor is an anchor node.
  const resolves = (id: string): boolean => {
    if (anchorSet.has(id)) return true;
    for (const a of ancestors(model, id)) if (anchorSet.has(a.id)) return true;
    return false;
  };
  // Nearest anchor owning an id (self or ancestor) — the owner for neighbor caps.
  const anchorOf = (id: string): string | null => {
    if (anchorSet.has(id)) return id;
    for (const a of ancestors(model, id)) if (anchorSet.has(a.id)) return a.id;
    return null;
  };

  // The VIEWPORT lit set: anchors + directly observed 1-hop neighbors ONLY.
  // Ancestors are collected SEPARATELY (litAncestors) and NEVER enter this set —
  // the root region rect spans the whole world, so lit ancestors would pollute
  // the viewport bbox back to root±padding (the tested defect class, D32).
  const lit = new Set<string>(anchorSet);
  const neighborSet = new Set<string>();

  // Lit observed edges (D32 real 1-hop): an edge enters the projection if EITHER
  // endpoint resolves. Both resolve -> an anchor-to-anchor path edge. Exactly one
  // resolves -> the far endpoint is a NEIGHBOR, capped per owning anchor with a
  // disclosed omission count (no anchor-induced hairball).
  const litEdges: AtlasEdge[] = [];
  const neighborCount = new Map<string, number>();
  let omittedNeighborCount = 0;
  const considerEdge = (e: AtlasEdge) => {
    if (!model.nodeIndex.has(e.src) || !model.nodeIndex.has(e.dst)) return;
    const rs = resolves(e.src);
    const rd = resolves(e.dst);
    if (!rs && !rd) return;
    if (rs && rd) {
      // Anchor-to-anchor observed path: both endpoints already in the changed set.
      litEdges.push(e);
      lit.add(e.src);
      lit.add(e.dst);
      return;
    }
    // One endpoint resolves; the other is a 1-hop neighbor. Cap per owning anchor.
    const anchorEndpoint = rs ? e.src : e.dst;
    const neighborEndpoint = rs ? e.dst : e.src;
    const owner = anchorOf(anchorEndpoint);
    if (owner === null) return; // defensive: resolves() true implies an owner
    const seen = neighborCount.get(owner) ?? 0;
    if (seen >= NEIGHBOR_CAP_PER_ANCHOR) {
      omittedNeighborCount++;
      return;
    }
    neighborCount.set(owner, seen + 1);
    litEdges.push(e);
    lit.add(anchorEndpoint);
    lit.add(neighborEndpoint);
    neighborSet.add(neighborEndpoint);
  };
  for (const e of model.edges.sym) considerEdge(e);
  for (const e of model.edges.file) if (e.kind === "imports") considerEdge(e);

  litEdges.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.src, b.src) || cmp(a.dst, b.dst));

  // Lit ancestors: containing folders of every lit node — for LEFT-TREE highlight
  // only. Collected AFTER the viewport set is frozen so they never widen it.
  const litAncestors = new Set<string>();
  for (const id of lit) {
    for (const a of ancestors(model, id)) litAncestors.add(a.id);
  }

  // BFS hop distance from anchors over the lit calls/imports edges (undirected).
  const adj = new Map<string, string[]>();
  const addAdj = (a: string, b: string) => {
    (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
  };
  for (const e of litEdges) {
    addAdj(e.src, e.dst);
    addAdj(e.dst, e.src);
  }
  const hop = new Map<string, number>();
  const queue: string[] = [];
  for (const a of anchorSet) {
    hop.set(a, 0);
    queue.push(a);
  }
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const d = hop.get(cur)!;
    for (const next of adj.get(cur) ?? []) {
      if (!hop.has(next)) {
        hop.set(next, d + 1);
        queue.push(next);
      }
    }
  }

  // Rail steps (mechanical order): anchors -> contains -> calls -> imports.
  const steps: RailStep[] = [];
  const seen = new Set<string>();
  const push = (
    group: RailGroup,
    nodeId: string,
    h: number,
    edgeKind: RailStep["edgeKind"],
    provenance: string,
    constituentClaimIds: number[] = [],
    omittedClaimCount = 0,
  ) => {
    const node = model.nodeIndex.get(nodeId);
    if (!node) return;
    const key = `${group}:${nodeId}`;
    if (seen.has(key)) return;
    seen.add(key);
    steps.push({
      nodeId,
      group,
      hop: h,
      edgeKind,
      provenance,
      label: node.name,
      path: node.path,
      constituentClaimIds,
      omittedClaimCount,
    });
  };

  const anchorProvenance = event.from
    ? `diff-range ${event.from}..${event.to}`
    : `symbol-anchor ${event.label}`;
  for (const id of [...anchorSet].sort(cmp)) push("anchors", id, 0, "anchor", anchorProvenance);

  // Contains: ancestors of anchors, hop = ancestor distance (1 = immediate parent).
  const containsSteps: RailStep[] = [];
  for (const id of anchorSet) {
    let dist = 1;
    for (const a of ancestors(model, id)) {
      containsSteps.push({
        nodeId: a.id,
        group: "contains",
        hop: dist,
        edgeKind: "contains",
        provenance: "structural:contains",
        label: a.name,
        path: a.path,
        constituentClaimIds: [],
        omittedClaimCount: 0,
      });
      dist++;
    }
  }
  const byNodeMinHop = new Map<string, RailStep>();
  for (const s of containsSteps) {
    const cur = byNodeMinHop.get(s.nodeId);
    if (!cur || s.hop < cur.hop) byNodeMinHop.set(s.nodeId, s);
  }
  for (const s of [...byNodeMinHop.values()].sort((a, b) => a.hop - b.hop || cmp(a.path, b.path))) {
    if (seen.has(`contains:${s.nodeId}`)) continue;
    seen.add(`contains:${s.nodeId}`);
    steps.push(s);
  }

  // Calls + imports: one step per lit edge, keyed on its far (dst) endpoint. Claim
  // ids from EVERY constituent edge to that endpoint are unioned into the step's
  // claim set (D33 aggregate trust — never "count + first claim id").
  const edgeSteps = (kind: "calls" | "imports", group: RailGroup): RailStep[] => {
    interface Agg {
      nodeId: string;
      hop: number;
      label: string;
      path: string;
      claims: ReturnType<typeof emptyClaimAccumulator>;
    }
    const byNode = new Map<string, Agg>();
    for (const e of litEdges) {
      if (e.kind !== kind) continue;
      const node = model.nodeIndex.get(e.dst);
      if (!node) continue;
      const h = hop.get(e.dst) ?? 1;
      let a = byNode.get(e.dst);
      if (!a) {
        a = {
          nodeId: e.dst,
          hop: h,
          label: node.name,
          path: node.path,
          claims: emptyClaimAccumulator(),
        };
        byNode.set(e.dst, a);
      } else if (h < a.hop) {
        a.hop = h;
      }
      accumulateClaims(a.claims, e.constituentClaimIds, e.omittedClaimCount);
    }
    return [...byNode.values()]
      .sort((a, b) => a.hop - b.hop || cmp(a.path, b.path))
      .map((a) => {
        const cs = finalizeClaimSet(a.claims);
        const ids =
          cs.constituentClaimIds.length > 0 ? cs.constituentClaimIds.join(",") : "unknown";
        return {
          nodeId: a.nodeId,
          group,
          hop: a.hop,
          edgeKind: kind,
          provenance: `links.claim_ids=${ids} predicate=${kind}`,
          label: a.label,
          path: a.path,
          constituentClaimIds: cs.constituentClaimIds,
          omittedClaimCount: cs.omittedClaimCount,
        };
      });
  };
  for (const s of edgeSteps("calls", "calls"))
    push(
      "calls",
      s.nodeId,
      s.hop,
      "calls",
      s.provenance,
      s.constituentClaimIds,
      s.omittedClaimCount,
    );
  for (const s of edgeSteps("imports", "imports"))
    push(
      "imports",
      s.nodeId,
      s.hop,
      "imports",
      s.provenance,
      s.constituentClaimIds,
      s.omittedClaimCount,
    );

  // Viewport: bounding box over the LIT set (anchors + neighbors) ONLY. Ancestors
  // are excluded by construction, so the root region can no longer pollute it.
  const viewport = boundingViewport(
    [...lit].map((id) => model.nodeIndex.get(id)).filter(Boolean) as AtlasNode[],
  );

  return {
    litNodeIds: [...lit].sort(cmp),
    anchors: [...anchorSet].sort(cmp),
    neighbors: [...neighborSet].sort(cmp),
    litAncestors: [...litAncestors].sort(cmp),
    litEdges,
    viewport,
    rail: steps,
    event: { kind: "diff", label: event.label, from: event.from, to: event.to },
    downgrades,
    omittedNeighborCount,
    projectionId: model.projectionId,
    structuralProjectionId: model.structuralProjectionId,
    evidenceProjectionId: model.evidenceProjectionId,
  };
}

function boundingViewport(nodes: AtlasNode[]): Viewport {
  if (nodes.length === 0) return { x: 0, y: 0, w: 1, h: 1 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const n of nodes) {
    minX = Math.min(minX, n.rect.x);
    minY = Math.min(minY, n.rect.y);
    maxX = Math.max(maxX, n.rect.x + n.rect.w);
    maxY = Math.max(maxY, n.rect.y + n.rect.h);
  }
  return {
    x: minX - VIEWPORT_PAD,
    y: minY - VIEWPORT_PAD,
    w: maxX - minX + VIEWPORT_PAD * 2,
    h: maxY - minY + VIEWPORT_PAD * 2,
  };
}
