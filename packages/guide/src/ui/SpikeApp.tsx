// SpikeApp — the SHOW shell for slice 5a. NOT a production route surface.
// It proves: quantized Atlas at real + 10x scale, the renderer seam, a lit
// Change Trace over a dimmed Atlas, mechanical Evidence Rail, measured search,
// and a live perf HUD vs the D12 budget table.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ancestors, compile } from "../atlas/compile.js";
import {
  computeSlice,
  DEFAULT_LOD,
  fitViewport,
  hotspotViewport,
  nextZoomLevel,
  revealForLevel,
} from "../atlas/lod.js";
import { project, resolveEvent } from "../atlas/event.js";
import { recencyBuckets } from "../atlas/lens.js";
import {
  loadSession,
  saveSession,
  type KeyValueStore,
  type SessionState,
} from "../atlas/persist.js";
import { expand10x } from "../atlas/synthetic.js";
import {
  generationIdentity,
  type AtlasModel,
  type CorpusInput,
  type EventProjection,
  type GenerationInfo,
  type Viewport,
} from "../atlas/types.js";
import {
  BUDGET_10X,
  BUDGET_CURRENT,
  createPerfRecorder,
  evaluateBudget,
  type PerfRecorder,
} from "../perf.js";
import { edgeKey, GraphRenderer, type LitState, type RendererApi } from "./GraphRenderer.js";
import { EvidenceRail } from "./EvidenceRail.js";
import { FocusedEvidence } from "./FocusedEvidence.js";
import { FocusGraph } from "./FocusGraph.js";
import { Minimap } from "./Minimap.js";
import { GenerationPrompt } from "./GenerationPrompt.js";
import { StateScreen, type StateScreenKind } from "./StateScreen.js";
import { selectVariant, variants } from "../variants/registry.js";
import { defaultDataSource, generationInfoOf, type GuideDataSource } from "../data/source.js";

/** Reading zoom targets (5c fold-in): rail/search focus lands here, per kind. */
const READING_ZOOM_FILE_MIN = 1.0;
const READING_TARGET_PX = 200;
const UNIT_PX = 14;
/**
 * Nominal pane size used to size the SLICE viewport for a PROGRAMMATIC reveal
 * (rail/search/connections/minimap/drill). The renderer animates the real camera
 * from its measured pane; this only needs to be generous enough that the target
 * node lands inside the recomputed slice (overscan covers the rest).
 */
const NOMINAL_PANE_W = 1400;
const NOMINAL_PANE_H = 900;
/** Default live-generation poll cadence (D10). */
const DEFAULT_POLL_MS = 30_000;

declare global {
  interface Window {
    __GUIDE_PERF__?: PerfRecorder["record"];
  }
}

type Scale = "current" | "10x";

interface HashQuery {
  diff?: string;
  sym?: string;
  q?: string;
  scale?: string;
  variant?: string;
}

function parseHashQuery(hash: string): HashQuery {
  const qi = hash.indexOf("?");
  if (qi === -1) return {};
  const params = new URLSearchParams(hash.slice(qi + 1));
  const out: HashQuery = {};
  for (const key of ["diff", "sym", "q", "scale", "variant"] as const) {
    const v = params.get(key);
    if (v !== null) out[key] = v;
  }
  return out;
}

interface LoadedData {
  corpus: CorpusInput;
  model: AtlasModel;
  jsonBytes: number;
}

export interface SpikeAppProps {
  dataSource?: GuideDataSource;
  /** Live-generation poll cadence (D10). Tests pass a small value. */
  pollMs?: number;
  /** Session-persistence store (D10). Defaults to localStorage; tests inject. */
  storage?: KeyValueStore;
}

export function SpikeApp({ dataSource, pollMs = DEFAULT_POLL_MS, storage }: SpikeAppProps = {}) {
  const perfRef = useRef<PerfRecorder>(createPerfRecorder());
  const perf = perfRef.current;
  const sourceRef = useRef<GuideDataSource>(dataSource ?? defaultDataSource());
  const apiRef = useRef<RendererApi | null>(null);
  const firstPaintDone = useRef(false);
  const appliedProjectionRef = useRef<string | null>(null);
  const lastVpRef = useRef({ level: -1, cx: Number.NaN, cy: Number.NaN });
  const lastFitIdRef = useRef<string | null>(null);
  const levelRef = useRef(0);
  // Hysteresis debounce (D9): coalesce onMove-driven re-slices (150-250 ms).
  const commitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingVpRef = useRef<{ vp: Viewport; z: number } | null>(null);
  // Live-generation tracking (D10).
  const loadedGenIdentityRef = useRef<string | null>(null);
  const dismissedGenRef = useRef<string | null>(null);

  const [hashQuery, setHashQuery] = useState<HashQuery>(() => parseHashQuery(window.location.hash));
  const scale: Scale = hashQuery.scale === "10x" ? "10x" : "current";
  const variant = selectVariant(hashQuery.variant);

  const [rawCorpus, setRawCorpus] = useState<CorpusInput | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<LoadedData | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, w: 100, h: 100 });
  const [openViewport, setOpenViewport] = useState<Viewport>({ x: 0, y: 0, w: 100, h: 100 });
  const [zoom, setZoom] = useState(0.8);
  const [revealLevel, setRevealLevel] = useState(0);
  const [pinnedIds, setPinnedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [search, setSearch] = useState("");
  const [perfTick, setPerfTick] = useState(0);
  const [apiReady, setApiReady] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [seededKey, setSeededKey] = useState<string | null>(null);
  const [pendingGen, setPendingGen] = useState<GenerationInfo | null>(null);
  // Connections view (focus graph) root. The map itself is always quiet now
  // (structural edges only draw when lit/selected/hovered): the map answers
  // "where", the Connections view answers "what connects".
  const [connectionsRootId, setConnectionsRootId] = useState<string | null>(null);

  // Track hash changes (deep links are the primary entry, D22).
  useEffect(() => {
    const onHash = () => setHashQuery(parseHashQuery(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Load corpus once, through the GuideDataSource seam (live endpoint first,
  // static snapshot fallback — D1). The live endpoint runs the R10 startup index
  // catch-up before it answers, so this is also the "index catch-up" wait.
  useEffect(() => {
    let cancelled = false;
    sourceRef.current
      .load()
      .then((loaded) => {
        if (cancelled) return;
        perf.setJsonBytes(loaded.bytes);
        loadedGenIdentityRef.current = generationInfoOf(loaded.corpus).identity;
        setRawCorpus(loaded.corpus);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [perf]);

  // Compile (measured) whenever the corpus or scale changes. An empty corpus
  // (no indexed store) renders the `ctx sync` empty state — never compiled.
  useEffect(() => {
    if (!rawCorpus || rawCorpus.files.length === 0) return;
    const corpus = scale === "10x" ? expand10x(rawCorpus) : rawCorpus;
    const t0 = performance.now();
    const model = compile(corpus);
    perf.setCompileMs(performance.now() - t0);
    perf.markProjectionAvailable();
    firstPaintDone.current = false;
    appliedProjectionRef.current = null;
    lastVpRef.current = { level: -1, cx: Number.NaN, cy: Number.NaN };
    // A new generation preserves only a still-existing selection (D10); pins reset.
    setFocusedId((prev) => (prev && model.nodeIndex.has(prev) ? prev : null));
    setPinnedIds(new Set());
    setData({ corpus, model, jsonBytes: perf.record.jsonBytes ?? 0 });
    // Provisional fit so the first slice can compute; the event viewport is
    // applied once the projection + renderer API are ready (defect 4).
    const fit = fitViewport(model);
    setViewport(fit);
    setZoom(0.8);
  }, [rawCorpus, scale, perf]);

  // Resolve + project the event (URL-carried, or corpus default).
  const projection = useMemo<{ ok: true; p: EventProjection } | { ok: false; reason: string } | null>(() => {
    if (!data) return null;
    const resolved = resolveEvent({ diff: hashQuery.diff, sym: hashQuery.sym, q: hashQuery.q }, data.corpus);
    if (!resolved.ok) return { ok: false, reason: resolved.reason };
    return { ok: true, p: project(resolved.event, data.model) };
  }, [data, hashQuery.diff, hashQuery.sym, hashQuery.q]);

  // Raw lit node set — fed into the slice so lit nodes are cap-protected and
  // aggregated onto visible ancestors at overview zoom (defect 6).
  const rawLit = useMemo<Set<string> | undefined>(() => {
    if (projection?.ok) return new Set(projection.p.litNodeIds);
    return undefined;
  }, [projection]);

  // Atom-level lit edge keys — fed into the slice so an aggregated edge lights
  // up iff ANY constituent atom edge is lit (defect 2).
  const rawLitEdges = useMemo<Set<string> | undefined>(() => {
    if (projection?.ok) return new Set(projection.p.litEdges.map(edgeKey));
    return undefined;
  }, [projection]);

  // A deep-link event (diff=/sym=) keeps its projected viewport; a cold `#/` open
  // focuses the recent hotspot (D10). `q=` is not an event (rejected upstream).
  const coldOpen = !hashQuery.diff && !hashQuery.sym;

  // The world viewport to open on: deep-link event bbox, cold-open hotspot, or fit.
  const projectionKey = data
    ? projection?.ok
      ? `${data.model.projectionId}:${coldOpen ? "cold" : projection.p.event.label}`
      : `${data.model.projectionId}:fit`
    : null;
  const baseOpenViewport = useMemo<Viewport>(() => {
    if (!data) return { x: 0, y: 0, w: 100, h: 100 };
    if (!projection?.ok) return fitViewport(data.model);
    if (coldOpen) return hotspotViewport(data.model, new Set(projection.p.litNodeIds));
    return projection.p.viewport;
  }, [projection, data, coldOpen]);

  // Seed the slice viewport/zoom synchronously ONCE per projection so the FIRST
  // slice the renderer (and footer) receive IS the event slice — single source,
  // one pass, no identity-scale intermediate (defects 1/3/4). A cold open restores
  // a saved same-generation session when present (D10 within-generation persist);
  // otherwise it uses the hotspot/event viewport. The renderer turns openViewport
  // into a deterministic defaultViewport from the measured pane.
  useEffect(() => {
    if (!data || !projectionKey || appliedProjectionRef.current === projectionKey) return;
    appliedProjectionRef.current = projectionKey;

    const genId = generationIdentity(data.model.generations);
    const restored = coldOpen ? loadSession(data.model.projectionId, genId, storage) : null;
    const valid =
      restored && (restored.focusedId === null || data.model.nodeIndex.has(restored.focusedId))
        ? restored
        : null;

    const vp = valid ? valid.viewport : baseOpenViewport;
    const span = Math.max(vp.w, vp.h);
    const seedZoom = valid ? valid.zoom : span <= 40 ? 1.5 : span <= 160 ? 1.0 : 0.6;
    const seedLevel = nextZoomLevel(0, seedZoom);

    levelRef.current = seedLevel;
    lastVpRef.current = { level: seedLevel, cx: vp.x + vp.w / 2, cy: vp.y + vp.h / 2 };
    setOpenViewport(vp);
    setViewport(vp);
    setZoom(seedZoom);
    setRevealLevel(seedLevel);
    if (valid) {
      setFocusedId(valid.focusedId);
      setPinnedIds(new Set(valid.pinnedIds.filter((id) => data.model.nodeIndex.has(id))));
    }
    setSeededKey(projectionKey);
  }, [data, projectionKey, baseOpenViewport, coldOpen, storage]);

  // Visible slice (measured as an "expand" recompute).
  const slice = useMemo(() => {
    if (!data) return null;
    return perf.measureAction("expand", () => {
      const s = computeSlice(data.model, viewport, zoom, DEFAULT_LOD, rawLit, rawLitEdges, {
        revealLevel,
        pinnedIds,
      });
      perf.setSliceMs(perf.record.expand.at(-1)?.ms ?? 0);
      perf.setCounts({
        logicalNodes: s.counts.logicalNodes,
        visibleNodes: s.counts.visibleNodes,
        logicalEdges: s.counts.logicalEdges,
        visibleEdges: s.counts.visibleEdges,
      });
      return s;
    });
  }, [data, viewport, zoom, revealLevel, pinnedIds, rawLit, rawLitEdges, perf]);

  // Lit rendering set = the slice's effective lit ids (aggregation onto visible
  // ancestors when a lit atom is hidden by the current zoom, defect 6).
  const litState: LitState = useMemo(() => {
    if (projection?.ok && slice) {
      return { litNodeIds: new Set(slice.litVisibleIds), hasEvent: true };
    }
    return { litNodeIds: new Set(), hasEvent: false };
  }, [projection, slice]);

  // Long-task observer.
  useEffect(() => {
    if (typeof PerformanceObserver === "undefined") return;
    try {
      const obs = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) perf.recordLongTask(entry.duration);
      });
      obs.observe({ entryTypes: ["longtask"] });
      return () => obs.disconnect();
    } catch {
      return;
    }
  }, [perf]);

  // Expose live perf + refresh the HUD periodically.
  useEffect(() => {
    window.__GUIDE_PERF__ = perf.record;
    const id = window.setInterval(() => setPerfTick((t) => t + 1), 500);
    return () => window.clearInterval(id);
  }, [perf]);

  // firstInteractive = projection-available -> map painted (defect 1). Marked via
  // double-rAF after the first slice mounts, independent of user input; robust to
  // hidden/background tabs (rAF is throttled there, so defer to visibility).
  useEffect(() => {
    if (!slice || firstPaintDone.current) return;
    firstPaintDone.current = true;
    const mark = () =>
      requestAnimationFrame(() => requestAnimationFrame(() => perf.markFirstInteractive()));
    if (typeof document !== "undefined" && document.hidden) {
      perf.addNote("firstInteractive deferred: tab hidden at first paint; marked on visibilitychange");
      const onVis = () => {
        if (!document.hidden) {
          document.removeEventListener("visibilitychange", onVis);
          mark();
        }
      };
      document.addEventListener("visibilitychange", onVis);
    } else {
      mark();
    }
  }, [slice, perf]);

  // Hysteresis + debounce (D9). A move commits a re-slice only when the semantic
  // zoom LEVEL changes (via nextZoomLevel — up-threshold to reveal, lower
  // down-threshold to drop, so a zoom hovering near a boundary can't flap) or the
  // viewport center moves beyond ~30% of the view. The commit is debounced ~180 ms
  // so a burst of onMove-end events coalesces into one recompute.
  const commitViewport = useCallback(() => {
    const pending = pendingVpRef.current;
    if (!pending) return;
    pendingVpRef.current = null;
    const { vp, z } = pending;
    const level = nextZoomLevel(levelRef.current, z);
    const cx = vp.x + vp.w / 2;
    const cy = vp.y + vp.h / 2;
    const last = lastVpRef.current;
    const moved = Number.isNaN(last.cx) ? Infinity : Math.hypot(cx - last.cx, cy - last.cy);
    const threshold = 0.3 * Math.max(vp.w, vp.h);
    if (level === last.level && moved < threshold) return;
    levelRef.current = level;
    lastVpRef.current = { level, cx, cy };
    setViewport(vp);
    setZoom(z);
    setRevealLevel(level);
  }, []);

  const onViewportChange = useCallback(
    (vp: Viewport, z: number) => {
      pendingVpRef.current = { vp, z };
      if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
      commitTimerRef.current = setTimeout(commitViewport, 180);
    },
    [commitViewport],
  );

  useEffect(() => () => {
    if (commitTimerRef.current) clearTimeout(commitTimerRef.current);
  }, []);

  // PROGRAMMATIC reveal: force an immediate slice recompute centered on `rect` at
  // the seeded zoom bucket, BYPASSING the pan/zoom hysteresis+debounce. That
  // damping must only smooth USER gestures — a rail/search/connections/minimap
  // reveal has to re-slice now, or the camera moves to the target while the slice
  // stays at folder LOD and the viewport is blank until a manual zoom/Fit.
  const commitSlice = useCallback((rect: Viewport, zoom: number) => {
    const z = Math.max(0.02, Math.min(4, zoom));
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    const w = NOMINAL_PANE_W / (z * UNIT_PX);
    const h = NOMINAL_PANE_H / (z * UNIT_PX);
    const vp: Viewport = { x: cx - w / 2, y: cy - h / 2, w, h };
    if (commitTimerRef.current) {
      clearTimeout(commitTimerRef.current);
      commitTimerRef.current = null;
    }
    pendingVpRef.current = null;
    const level = nextZoomLevel(0, z); // fresh bucket — no hysteresis dead-band
    levelRef.current = level;
    lastVpRef.current = { level, cx, cy };
    setViewport(vp);
    setZoom(z);
    setRevealLevel(level);
  }, []);

  // Zoom that fits a world rect into the nominal pane (for region reveals).
  const fitZoomFor = useCallback(
    (rect: Viewport) =>
      Math.min(NOMINAL_PANE_W / (rect.w * UNIT_PX), NOMINAL_PANE_H / (rect.h * UNIT_PX)),
    [],
  );

  const setHashParam = useCallback((patch: Partial<HashQuery>) => {
    const next = { ...parseHashQuery(window.location.hash), ...patch };
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) params.set(k, v);
    window.location.hash = `#/?${params.toString()}`;
  }, []);

  const searchResults = useMemo(() => {
    if (!data || search.trim() === "") return [];
    const q = search.trim().toLowerCase();
    return perf.measureAction("search", () => {
      const hits = data.model.nodes.filter(
        (n) => n.name.toLowerCase().includes(q) || n.path.toLowerCase().includes(q),
      );
      return hits.slice(0, 30);
    });
  }, [data, search, perf]);

  // Selection (canvas click): highlight + preview. Camera only moves if the node
  // is offscreen or too small on-screen (R4-1); an already-visible node just gets
  // emphasized. Clicking a folder whose children are hidden at the current zoom
  // PINS its next level open (D9 "click pins an expansion").
  const focusNode = useCallback(
    (nodeId: string) => {
      setFocusedId(nodeId);
      const node = data?.model.nodeIndex.get(nodeId);
      if (!node) return;
      if (node.kind === "folder") {
        const reveal = revealForLevel(levelRef.current);
        const childrenHidden = node.depth + 1 > reveal.maxFolderDepth || !reveal.showFiles;
        if (childrenHidden) {
          setPinnedIds((prev) => (prev.has(node.id) ? prev : new Set(prev).add(node.id)));
        }
      }
      apiRef.current?.revealNode({ x: node.rect.x, y: node.rect.y, w: node.rect.w, h: node.rect.h });
    },
    [data],
  );

  // Reading focus (rail / search / connections destinations): ALWAYS center the
  // target at a deterministic reading zoom AND force an immediate slice recompute
  // (commitSlice) so the destination is actually in the slice — never just a
  // camera move over a folder-level slice. A decl has no map cell under Option A,
  // so focusing one reveals its FILE lot.
  const focusReading = useCallback(
    (nodeId: string) => {
      const model = data?.model;
      if (!model) return;
      const node = model.nodeIndex.get(nodeId);
      if (!node) return;
      setFocusedId(nodeId);
      const target = node.kind === "decl" ? model.nodeIndex.get(node.parent ?? "") ?? node : node;
      if (target.kind === "folder") {
        const pad = 2;
        const rect: Viewport = {
          x: target.rect.x - pad,
          y: target.rect.y - pad,
          w: target.rect.w + pad * 2,
          h: target.rect.h + pad * 2,
        };
        commitSlice(rect, fitZoomFor(rect));
        apiRef.current?.setViewport(rect);
        return;
      }
      const side = Math.max(target.rect.w, target.rect.h);
      const targetZoom = Math.max(READING_ZOOM_FILE_MIN, READING_TARGET_PX / (side * UNIT_PX));
      commitSlice(target.rect, targetZoom);
      apiRef.current?.centerOn(
        { x: target.rect.x, y: target.rect.y, w: target.rect.w, h: target.rect.h },
        targetZoom,
      );
    },
    [data, commitSlice, fitZoomFor],
  );

  // Clear selection AND any pinned reveals (D9: pins cleared on deselect/Esc).
  const clearSelection = useCallback(() => {
    setFocusedId(null);
    setPinnedIds((prev) => (prev.size === 0 ? prev : new Set()));
  }, []);

  // Double-click a folder region → fit to it (R4-6). Records the fit so Esc can
  // back out to the parent region.
  const drillNode = useCallback(
    (nodeId: string) => {
      const node = data?.model.nodeIndex.get(nodeId);
      if (!node || node.kind !== "folder") return;
      const pad = 2;
      const target: Viewport = {
        x: node.rect.x - pad,
        y: node.rect.y - pad,
        w: node.rect.w + pad * 2,
        h: node.rect.h + pad * 2,
      };
      lastFitIdRef.current = nodeId;
      commitSlice(target, fitZoomFor(target));
      apiRef.current?.setViewport(target);
    },
    [data, commitSlice, fitZoomFor],
  );

  // Open the focused Connections view rooted on a file/decl node.
  const openConnections = useCallback((nodeId: string) => {
    const node = data?.model.nodeIndex.get(nodeId);
    if (!node || node.kind === "folder") return;
    setFocusedId(nodeId);
    setConnectionsRootId(nodeId);
  }, [data]);

  // Double-click a node: folders drill/fit (R4-6); files/decls open Connections.
  const onDoubleClickNode = useCallback(
    (nodeId: string) => {
      const node = data?.model.nodeIndex.get(nodeId);
      if (!node) return;
      if (node.kind === "folder") drillNode(nodeId);
      else openConnections(nodeId);
    },
    [data, drillNode, openConnections],
  );

  // "Open on map" from inside the Connections view: dismiss + reveal on the atlas.
  // Uses the reading-focus path so the target is centered AND re-sliced (not just
  // a camera move that could land on a folder-level slice).
  const openOnMap = useCallback(
    (nodeId: string) => {
      setConnectionsRootId(null);
      focusReading(nodeId);
    },
    [focusReading],
  );

  // `v` opens Connections for the selected node (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "v" && e.key !== "V") return;
      if (connectionsRootId != null) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (focusedId != null) openConnections(focusedId);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedId, connectionsRootId, openConnections]);

  // Esc: first clears selection; a second press backs the fit out to the parent
  // region of the last drill (cheap back-out, R4-6). The Connections overlay owns
  // Esc while open, so yield to it here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (connectionsRootId != null) return;
      if (focusedId != null) {
        clearSelection();
        return;
      }
      const lastFit = lastFitIdRef.current;
      const parentId = lastFit ? data?.model.nodeIndex.get(lastFit)?.parent ?? null : null;
      const parent = parentId ? data?.model.nodeIndex.get(parentId) : null;
      if (parent) {
        lastFitIdRef.current = parent.id;
        apiRef.current?.setViewport({ x: parent.rect.x - 2, y: parent.rect.y - 2, w: parent.rect.w + 4, h: parent.rect.h + 4 });
      } else {
        setFitRequest((n) => n + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusedId, clearSelection, data, connectionsRootId]);

  const runSweep = useCallback(async () => {
    if (!apiRef.current || sweeping) return;
    setSweeping(true);
    perf.clearFps(); // measure only this tour, not stale idle samples (defect 2)
    try {
      await apiRef.current.runSweep((fps) => perf.recordFps(fps));
    } finally {
      setSweeping(false);
    }
  }, [perf, sweeping]);

  // Within-generation persistence (D10): save viewport/selection/pins under the
  // (projectionId, generation identity) key so a reload of the SAME generation
  // restores them; a different generation identity never restores stale state.
  useEffect(() => {
    if (!data || seededKey !== projectionKey) return;
    const genId = generationIdentity(data.model.generations);
    const state: SessionState = { viewport, zoom, focusedId, pinnedIds: [...pinnedIds] };
    saveSession(data.model.projectionId, genId, state, storage);
  }, [data, seededKey, projectionKey, viewport, zoom, focusedId, pinnedIds, storage]);

  // Recent-lens ramp (D11 default lens): neutral recency bucket per file lot.
  const recencyMap = useMemo(
    () => (data ? recencyBuckets(data.model, data.corpus) : undefined),
    [data],
  );

  // Minimap substrate data (D9): top-level folder regions + lit regions + world
  // bounds + search-hit centers. Never files/decls.
  const topRegions = useMemo(() => {
    if (!data) return [];
    const d1 = data.model.regions.filter((r) => r.depth === 1);
    return d1.length > 0 ? d1 : data.model.regions.filter((r) => r.depth === 0);
  }, [data]);
  const worldBounds = useMemo(
    () => (data ? fitViewport(data.model) : { x: 0, y: 0, w: 1, h: 1 }),
    [data],
  );
  const litRegionIds = useMemo(() => {
    const set = new Set<string>();
    if (!data || !projection?.ok) return set;
    const topIds = new Set(topRegions.map((r) => r.id));
    for (const id of projection.p.litNodeIds) {
      const node = data.model.nodeIndex.get(id);
      if (!node) continue;
      if (topIds.has(node.id)) {
        set.add(node.id);
        continue;
      }
      for (const anc of ancestors(data.model, id)) {
        if (topIds.has(anc.id)) {
          set.add(anc.id);
          break;
        }
      }
    }
    return set;
  }, [data, projection, topRegions]);
  const searchMarks = useMemo(
    () => searchResults.map((n) => ({ x: n.rect.x + n.rect.w / 2, y: n.rect.y + n.rect.h / 2 })),
    [searchResults],
  );

  const panToRegion = useCallback(
    (regionId: string) => {
      const node = data?.model.nodeIndex.get(regionId);
      if (!node) return;
      const target: Viewport = {
        x: node.rect.x - 2,
        y: node.rect.y - 2,
        w: node.rect.w + 4,
        h: node.rect.h + 4,
      };
      commitSlice(target, fitZoomFor(target));
      apiRef.current?.setViewport(target);
    },
    [data, commitSlice, fitZoomFor],
  );
  const minimapPan = useCallback(
    (vp: Viewport) => {
      commitSlice(vp, fitZoomFor(vp));
      apiRef.current?.setViewport(vp);
    },
    [commitSlice, fitZoomFor],
  );

  // Live-generation poll (D10). Detect a new generation WITHOUT swapping the map:
  // only a prompt is raised; the corpus is reloaded solely on an explicit switch.
  useEffect(() => {
    const source = sourceRef.current;
    if (!source.pollGeneration || !data) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const info = await source.pollGeneration!();
        if (cancelled) return;
        const loaded = loadedGenIdentityRef.current;
        if (loaded && info.identity !== loaded && info.identity !== dismissedGenRef.current) {
          setPendingGen(info);
        }
      } catch {
        // Poll failures are non-fatal (e.g. static snapshot / no server).
      }
    };
    const id = setInterval(tick, Math.max(1, pollMs));
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [data, pollMs]);

  const currentGenInfo = useMemo<GenerationInfo | null>(
    () => (data ? generationInfoOf(data.corpus) : null),
    [data],
  );
  const switchGeneration = useCallback(() => {
    if (!pendingGen) return;
    setPendingGen(null);
    sourceRef.current
      .load()
      .then((loaded) => {
        perf.setJsonBytes(loaded.bytes);
        loadedGenIdentityRef.current = generationInfoOf(loaded.corpus).identity;
        dismissedGenRef.current = null;
        setRawCorpus(loaded.corpus);
      })
      .catch((err: unknown) => setLoadError(err instanceof Error ? err.message : String(err)));
  }, [pendingGen, perf]);
  const dismissGeneration = useCallback(() => {
    setPendingGen((cur) => {
      if (cur) dismissedGenRef.current = cur.identity;
      return null;
    });
  }, []);

  // ---- Render states ----
  if (loadError) {
    const state: StateScreenKind = { kind: "error", detail: loadError };
    return <StateScreen state={state} />;
  }
  if (rawCorpus && rawCorpus.files.length === 0) {
    return <StateScreen state={{ kind: "empty" }} />;
  }
  if (!data || !slice) {
    return (
      <StateScreen
        state={{
          kind: "loading",
          detail: "Loading the code Atlas — the server runs its index catch-up on connect.",
        }}
      />
    );
  }
  // Gate the shell until the event viewport has been seeded, so the renderer and
  // the footer both bind to the SAME (event) slice — never an earlier whole-map
  // state (defects 1/3). One tick.
  if (seededKey !== projectionKey) {
    return <StateScreen state={{ kind: "loading", detail: "Focusing the event viewport…" }} />;
  }

  const budget = scale === "10x" ? BUDGET_10X : BUDGET_CURRENT;
  const checks = evaluateBudget(perf.record, budget);
  const gen = data.model.generations;
  // Optional variant chrome (item 8): a HUD extra and a collapsible legend overlay.
  const HudExtra = variant.ChromeSlots?.hudExtra;
  const Legend = variant.ChromeSlots?.legend;

  return (
    <div className={`spike-shell ${variant.themeClass}`} data-perf-tick={perfTick}>
      <header className="hud">
        <div className="hud-repo">
          <strong>{data.model.repo}</strong>
          <span className="hud-rev">@ {data.model.sourceRevision.slice(0, 12)}</span>
        </div>
        <div className="hud-gen">
          gen code={gen.code} · git={gen.git} · docs={gen.docs} · memory={gen.memory}
        </div>
        {/* Recent lens is the default and only lens in this slice (D11); the other
            lenses (Churn/Co-change/Review/Conflict) are slice 5f — a static label,
            not a switcher. */}
        <div className="hud-lens" aria-label="active lens">
          Lens: Recent
        </div>
        <input
          className="omnibox"
          type="search"
          placeholder="Search files, folders, symbols…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="omnibox search"
        />
        <div className="hud-tools">
          <label>
            Scale{" "}
            <select value={scale} onChange={(e) => setHashParam({ scale: e.target.value })}>
              <option value="current">current</option>
              <option value="10x">10x</option>
            </select>
          </label>
          <label>
            Variant{" "}
            <select value={variant.id} onChange={(e) => setHashParam({ variant: e.target.value })}>
              {variants.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={() => setFitRequest((n) => n + 1)}>
            Fit repo
          </button>
          <button type="button" disabled={sweeping || !apiReady} onClick={runSweep}>
            {sweeping ? "Sweeping…" : "Sweep (fps)"}
          </button>
          {HudExtra ? (
            <span className="chrome-hud-extra">
              <HudExtra />
            </span>
          ) : null}
        </div>
      </header>

      {projection && !projection.ok ? (
        <div className="event-reject" role="status">
          Not an event: {projection.reason}
        </div>
      ) : null}

      {pendingGen && currentGenInfo ? (
        <GenerationPrompt
          current={currentGenInfo}
          pending={pendingGen}
          onSwitch={switchGeneration}
          onDismiss={dismissGeneration}
        />
      ) : null}

      <div className="spike-body">
        <main className="canvas-col">
          {Legend ? (
            <details className="legend-overlay" open>
              <summary>Legend</summary>
              <Legend />
            </details>
          ) : null}
          {searchResults.length > 0 ? (
            <div className="search-results">
              {searchResults.map((n) => (
                <button key={n.id} type="button" className="search-hit" onClick={() => focusReading(n.id)}>
                  <span className={`hit-kind hit-${n.kind}`}>{n.kind}</span> {n.path}
                </button>
              ))}
            </div>
          ) : null}
          <GraphRenderer
            slice={slice}
            litState={litState}
            focusedId={focusedId}
            variant={variant}
            initialViewport={openViewport}
            viewport={viewport}
            onFocus={focusNode}
            onViewportChange={onViewportChange}
            fitRequest={fitRequest}
            onClearSelection={clearSelection}
            onDrill={onDoubleClickNode}
            recencyBuckets={recencyMap}
            onApiReady={(api) => {
              apiRef.current = api;
              setApiReady(true);
            }}
          />
          <Minimap
            regions={topRegions}
            worldBounds={worldBounds}
            viewport={viewport}
            litRegionIds={litRegionIds}
            searchMarks={searchMarks}
            onRegionClick={panToRegion}
            onViewportChange={minimapPan}
          />
          <div className="map-hud">
            <span>
              visible {slice.counts.visibleNodes}/{slice.counts.logicalNodes} nodes · {slice.counts.visibleEdges}/
              {slice.counts.logicalEdges} edges
            </span>
            {slice.omissions.length > 0 ? (
              <details className="omissions">
                <summary>{slice.omissions.length} disclosed omissions</summary>
                <ul>
                  {slice.omissions.map((o) => (
                    <li key={o}>{o}</li>
                  ))}
                </ul>
              </details>
            ) : (
              <span className="omissions-none">no omissions at this zoom</span>
            )}
            {data.corpus.disclosures.length > 0 ? (
              <details className="disclosures">
                <summary>corpus disclosures</summary>
                <ul>
                  {data.corpus.disclosures.map((d) => (
                    <li key={d}>{d}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        </main>

        <div className="rail-col">
          {focusedId ? (
            <FocusedEvidence
              model={data.model}
              selectedId={focusedId}
              onFocus={focusReading}
              onOpenConnections={openConnections}
            />
          ) : null}
          {projection?.ok ? (
            <EvidenceRail
              rail={projection.p.rail}
              focusedId={focusedId}
              onFocus={focusReading}
              variant={variant}
              eventLabel={projection.p.event.label}
            />
          ) : null}
        </div>

        <section className="perf-hud" aria-label="performance budget">
          <h2>Perf HUD — D12 ({scale})</h2>
          <table>
            <thead>
              <tr>
                <th>metric</th>
                <th>measured</th>
                <th>budget</th>
                <th>ok</th>
              </tr>
            </thead>
            <tbody>
              {checks.map((c) => (
                <tr key={c.label} className={c.pass ? "pass" : "fail"}>
                  <td>{c.label}</td>
                  <td>{Number.isNaN(c.measured) ? "—" : `${c.measured.toFixed(1)} ${c.unit}`}</td>
                  <td>
                    {c.higherIsBetter ? "≥" : "≤"} {c.budget} {c.unit}
                  </td>
                  <td>{c.pass ? "pass" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <dl className="perf-extra">
            <div>
              <dt>compile</dt>
              <dd>{perf.record.compileMs?.toFixed(1) ?? "—"} ms</dd>
            </div>
            <div>
              <dt>slice</dt>
              <dd>{perf.record.sliceMs?.toFixed(1) ?? "—"} ms</dd>
            </div>
            <div>
              <dt>corpus JSON</dt>
              <dd>{perf.record.jsonBytes ? `${(perf.record.jsonBytes / 1024).toFixed(1)} KiB` : "—"}</dd>
            </div>
            <div>
              <dt>projectionId</dt>
              <dd className="mono">{data.model.projectionId}</dd>
            </div>
          </dl>
          {perf.record.notes.length > 0 ? (
            <ul className="perf-notes">
              {perf.record.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
        </section>
      </div>

      {connectionsRootId && data.model.nodeIndex.has(connectionsRootId) ? (
        <FocusGraph
          model={data.model}
          rootId={connectionsRootId}
          litIds={rawLit}
          onClose={() => setConnectionsRootId(null)}
          onOpenOnMap={openOnMap}
        />
      ) : null}
    </div>
  );
}
