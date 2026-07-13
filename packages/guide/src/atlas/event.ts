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

const HEX = /^[0-9a-f]{7,40}$/;
const VIEWPORT_PAD = 4;

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

/** Resolve raw anchors to atlas node ids that actually exist in the model. */
function resolveAnchorNodes(event: ProjectableEvent, model: AtlasModel): Set<string> {
  const set = new Set<string>();
  for (const f of event.anchorFiles) {
    if (model.nodeIndex.has(f)) set.add(f);
  }
  for (const s of event.anchorSyms) {
    if (model.nodeIndex.has(s)) set.add(s);
    else {
      // Fall back to the containing file lot when the decl is not an atlas atom.
      const parent = fileId(s.startsWith("sym:") ? s.slice(4).split("#")[0] : s);
      if (model.nodeIndex.has(parent)) set.add(parent);
    }
  }
  return set;
}

export function project(event: ProjectableEvent, model: AtlasModel): EventProjection {
  const anchorSet = resolveAnchorNodes(event, model);

  // An id "resolves" to the event if it or an ancestor is an anchor node.
  const resolves = (id: string): boolean => {
    if (anchorSet.has(id)) return true;
    for (const a of ancestors(model, id)) if (anchorSet.has(a.id)) return true;
    return false;
  };

  const lit = new Set<string>(anchorSet);
  // Contains parents (region path to root) for every anchor.
  for (const id of anchorSet) {
    for (const a of ancestors(model, id)) lit.add(a.id);
  }

  // Lit observed edges: direct calls/imports where BOTH endpoints resolve.
  const litEdges: AtlasEdge[] = [];
  const considerEdge = (e: AtlasEdge) => {
    if (!model.nodeIndex.has(e.src) || !model.nodeIndex.has(e.dst)) return;
    if (!resolves(e.src) || !resolves(e.dst)) return;
    litEdges.push(e);
    for (const endpoint of [e.src, e.dst]) {
      lit.add(endpoint);
      for (const a of ancestors(model, endpoint)) lit.add(a.id);
    }
  };
  for (const e of model.edges.sym) considerEdge(e);
  for (const e of model.edges.file) if (e.kind === "imports") considerEdge(e);

  litEdges.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.src, b.src) || cmp(a.dst, b.dst));

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
  ) => {
    const node = model.nodeIndex.get(nodeId);
    if (!node) return;
    const key = `${group}:${nodeId}`;
    if (seen.has(key)) return;
    seen.add(key);
    steps.push({ nodeId, group, hop: h, edgeKind, provenance, label: node.name, path: node.path });
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

  // Calls + imports: one step per lit edge, keyed on its far (dst) endpoint.
  const edgeSteps = (kind: "calls" | "imports", group: RailGroup): RailStep[] => {
    const collected: RailStep[] = [];
    for (const e of litEdges) {
      if (e.kind !== kind) continue;
      const node = model.nodeIndex.get(e.dst);
      if (!node) continue;
      collected.push({
        nodeId: e.dst,
        group,
        hop: hop.get(e.dst) ?? 1,
        edgeKind: kind,
        provenance: `links.claim_id=${e.claimId ?? "unknown"} predicate=${kind}`,
        label: node.name,
        path: node.path,
      });
    }
    const min = new Map<string, RailStep>();
    for (const s of collected) {
      const cur = min.get(s.nodeId);
      if (!cur || s.hop < cur.hop) min.set(s.nodeId, s);
    }
    return [...min.values()].sort((a, b) => a.hop - b.hop || cmp(a.path, b.path));
  };
  for (const s of edgeSteps("calls", "calls"))
    push("calls", s.nodeId, s.hop, "calls", s.provenance);
  for (const s of edgeSteps("imports", "imports"))
    push("imports", s.nodeId, s.hop, "imports", s.provenance);

  // Viewport: bounding box over lit nodes, padded.
  const viewport = boundingViewport(
    [...lit].map((id) => model.nodeIndex.get(id)).filter(Boolean) as AtlasNode[],
  );

  return {
    litNodeIds: [...lit].sort(cmp),
    litEdges,
    viewport,
    rail: steps,
    event: { kind: "diff", label: event.label, from: event.from, to: event.to },
    projectionId: model.projectionId,
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
