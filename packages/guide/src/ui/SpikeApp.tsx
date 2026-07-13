// SpikeApp — the SHOW shell for slice 5a. NOT a production route surface.
// It proves: quantized Atlas at real + 10x scale, the renderer seam, a lit
// Change Trace over a dimmed Atlas, mechanical Evidence Rail, measured search,
// and a live perf HUD vs the D12 budget table.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { compile } from "../atlas/compile.js";
import { computeSlice, DEFAULT_LOD, fitViewport, zoomBucketIndex } from "../atlas/lod.js";
import { project, resolveEvent } from "../atlas/event.js";
import { expand10x } from "../atlas/synthetic.js";
import type { AtlasModel, CorpusInput, EventProjection, Viewport } from "../atlas/types.js";
import {
  BUDGET_10X,
  BUDGET_CURRENT,
  createPerfRecorder,
  evaluateBudget,
  type PerfRecorder,
} from "../perf.js";
import { edgeKey, GraphRenderer, type LitState, type RendererApi } from "./GraphRenderer.js";
import { EvidenceRail } from "./EvidenceRail.js";
import { StateScreen, type StateScreenKind } from "./StateScreen.js";
import { selectVariant, variants } from "../variants/registry.js";

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

export function SpikeApp() {
  const perfRef = useRef<PerfRecorder>(createPerfRecorder());
  const perf = perfRef.current;
  const apiRef = useRef<RendererApi | null>(null);
  const firstPaintDone = useRef(false);
  const appliedProjectionRef = useRef<string | null>(null);
  const lastVpRef = useRef({ bucket: -1, cx: Number.NaN, cy: Number.NaN });

  const [hashQuery, setHashQuery] = useState<HashQuery>(() => parseHashQuery(window.location.hash));
  const scale: Scale = hashQuery.scale === "10x" ? "10x" : "current";
  const variant = selectVariant(hashQuery.variant);

  const [rawCorpus, setRawCorpus] = useState<CorpusInput | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<LoadedData | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, w: 100, h: 100 });
  const [zoom, setZoom] = useState(0.8);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [fitRequest, setFitRequest] = useState(0);
  const [search, setSearch] = useState("");
  const [perfTick, setPerfTick] = useState(0);
  const [apiReady, setApiReady] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [seededKey, setSeededKey] = useState<string | null>(null);

  // Track hash changes (deep links are the primary entry, D22).
  useEffect(() => {
    const onHash = () => setHashQuery(parseHashQuery(window.location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Load corpus once.
  useEffect(() => {
    let cancelled = false;
    fetch("./generated/corpus.json")
      .then(async (res) => {
        if (!res.ok) throw new Error(`corpus fetch failed: HTTP ${res.status}`);
        const text = await res.text();
        const corpus = JSON.parse(text) as CorpusInput;
        if (!cancelled) {
          perf.setJsonBytes(new Blob([text]).size);
          setRawCorpus(corpus);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [perf]);

  // Compile (measured) whenever the corpus or scale changes.
  useEffect(() => {
    if (!rawCorpus) return;
    const corpus = scale === "10x" ? expand10x(rawCorpus) : rawCorpus;
    const t0 = performance.now();
    const model = compile(corpus);
    perf.setCompileMs(performance.now() - t0);
    perf.markProjectionAvailable();
    firstPaintDone.current = false;
    appliedProjectionRef.current = null;
    lastVpRef.current = { bucket: -1, cx: Number.NaN, cy: Number.NaN };
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

  // The world viewport to open on: the event bbox, or a repo fit.
  const projectionKey = data
    ? projection?.ok
      ? `${data.model.projectionId}:${projection.p.event.label}`
      : `${data.model.projectionId}:fit`
    : null;
  const initialViewport = useMemo<Viewport>(
    () => (projection?.ok ? projection.p.viewport : data ? fitViewport(data.model) : { x: 0, y: 0, w: 100, h: 100 }),
    [projection, data],
  );

  // Seed the slice viewport/zoom synchronously ONCE per projection so the FIRST
  // slice the renderer (and footer) receive IS the event slice — single source,
  // one pass, no identity-scale intermediate (defects 1/3/4). The renderer turns
  // initialViewport into a deterministic defaultViewport from the measured pane.
  useEffect(() => {
    if (!data || !projectionKey || appliedProjectionRef.current === projectionKey) return;
    appliedProjectionRef.current = projectionKey;
    const vp = initialViewport;
    const span = Math.max(vp.w, vp.h);
    const seedZoom = span <= 40 ? 1.5 : span <= 160 ? 1.0 : 0.6;
    lastVpRef.current = { bucket: zoomBucketIndex(seedZoom), cx: vp.x + vp.w / 2, cy: vp.y + vp.h / 2 };
    setViewport(vp);
    setZoom(seedZoom);
    setSeededKey(projectionKey);
  }, [data, projectionKey, initialViewport]);

  // Visible slice (measured as an "expand" recompute).
  const slice = useMemo(() => {
    if (!data) return null;
    return perf.measureAction("expand", () => {
      const s = computeSlice(data.model, viewport, zoom, DEFAULT_LOD, rawLit, rawLitEdges);
      perf.setSliceMs(perf.record.expand.at(-1)?.ms ?? 0);
      perf.setCounts({
        logicalNodes: s.counts.logicalNodes,
        visibleNodes: s.counts.visibleNodes,
        logicalEdges: s.counts.logicalEdges,
        visibleEdges: s.counts.visibleEdges,
      });
      return s;
    });
  }, [data, viewport, zoom, rawLit, rawLitEdges, perf]);

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

  // Hysteresis: only re-slice when the zoom bucket changes or the viewport center
  // moves beyond ~30% of the view. A focus-only camera nudge within the same tile
  // does NOT trigger a slice recompute (defect 3).
  const onViewportChange = useCallback((vp: Viewport, z: number) => {
    const bucket = zoomBucketIndex(z);
    const cx = vp.x + vp.w / 2;
    const cy = vp.y + vp.h / 2;
    const last = lastVpRef.current;
    const moved = Number.isNaN(last.cx) ? Infinity : Math.hypot(cx - last.cx, cy - last.cy);
    const threshold = 0.3 * Math.max(vp.w, vp.h);
    if (bucket === last.bucket && moved < threshold) return;
    lastVpRef.current = { bucket, cx, cy };
    setViewport(vp);
    setZoom(z);
  }, []);

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

  const focusNode = useCallback(
    (nodeId: string) => {
      setFocusedId(nodeId);
      const node = data?.model.nodeIndex.get(nodeId);
      if (!node) return;
      // A code result focuses its declaration/file: seed the slice viewport at a
      // zoom that REVEALS the target's kind (D9/D14), then move the camera. Seeding
      // state re-slices immediately so the hit path is present (defect 5).
      const pad = 8;
      const target: Viewport = {
        x: node.rect.x - pad,
        y: node.rect.y - pad,
        w: node.rect.w + pad * 2,
        h: node.rect.h + pad * 2,
      };
      const revealZoom = node.kind === "decl" ? 1.6 : node.kind === "file" ? 1.0 : 0.6;
      lastVpRef.current = {
        bucket: zoomBucketIndex(revealZoom),
        cx: target.x + target.w / 2,
        cy: target.y + target.h / 2,
      };
      setViewport(target);
      setZoom(revealZoom);
      apiRef.current?.setViewport(target);
    },
    [data],
  );

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

  // ---- Render states ----
  if (loadError) {
    const state: StateScreenKind = { kind: "error", detail: loadError };
    return <StateScreen state={state} />;
  }
  if (rawCorpus && rawCorpus.files.length === 0) {
    return <StateScreen state={{ kind: "empty" }} />;
  }
  if (!data || !slice) {
    return <StateScreen state={{ kind: "loading" }} />;
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
                <button key={n.id} type="button" className="search-hit" onClick={() => focusNode(n.id)}>
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
            initialViewport={initialViewport}
            onFocus={focusNode}
            onViewportChange={onViewportChange}
            fitRequest={fitRequest}
            onApiReady={(api) => {
              apiRef.current = api;
              setApiReady(true);
            }}
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

        {projection?.ok ? (
          <EvidenceRail
            rail={projection.p.rail}
            focusedId={focusedId}
            onFocus={focusNode}
            variant={variant}
            eventLabel={projection.p.event.label}
          />
        ) : null}

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
    </div>
  );
}
