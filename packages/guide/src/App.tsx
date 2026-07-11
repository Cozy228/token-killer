/**
 * App shell (P40 R14/R15) — the "Instrument". A job-first IA, NOT a canvas:
 *   top bar (repo identity + freshness + ⌘K search)  ·  persistent DR-01 banner  ·
 *   left rail (Orient J1 / Review J4 / Legend J5)  ·  routed main  ·
 *   command palette (Find J2)  ·  evidence drawer (provenance J5).
 * Graph rendering appears only bounded inside a Subject (J3). One coherent design;
 * no skin system (R14).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { House, ClipboardText, Info, MagnifyingGlass, Sun } from "@phosphor-icons/react";
import type { ClaimStatus, EvidencePacket } from "@contexa/core";
import { AppContext, type AppState } from "./appContext.ts";
import { useHashRoute, navigate } from "./router.ts";
import { useAsync } from "./util.ts";
import { getCanvas } from "./api.ts";
import { ACCELERATOR_DISCLOSURE_TEXT } from "./constants.ts";
import { EvidenceDrawer } from "./components/EvidenceDrawer.tsx";
import { ClaimLegend, STATUS_ORDER } from "./components/ClaimLegend.tsx";
import { CommandPalette } from "./components/CommandPalette.tsx";
import { Orient } from "./views/Orient.tsx";
import { Subject } from "./views/Subject.tsx";
import { Review } from "./views/Review.tsx";

export function App(): React.ReactElement {
  const route = useHashRoute();
  const canvas = useAsync(getCanvas, []);
  const [evidence, setEvidence] = useState<EvidencePacket | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [focus, setFocus] = useState<Set<ClaimStatus> | null>(null);
  const [scope, setScope] = useState<{ counts: Record<string, number>; label: string }>({
    counts: {},
    label: "entities on this surface",
  });

  const openEvidence = useCallback((e: EvidencePacket) => setEvidence(e), []);
  const publishScope = useCallback(
    (counts: Record<string, number>, label: string) => setScope({ counts, label }),
    [],
  );
  const toggleFocus = useCallback((s: ClaimStatus) => {
    setFocus((prev) => {
      const base = prev ?? new Set<ClaimStatus>(STATUS_ORDER);
      const next = new Set(base);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next.size === STATUS_ORDER.length ? null : next;
    });
  }, []);

  const app: AppState = useMemo(
    () => ({ openEvidence, focus, toggleFocus, setScope: publishScope }),
    [openEvidence, focus, toggleFocus, publishScope],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      } else if (e.key === "Escape") {
        setPaletteOpen(false);
        setEvidence(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const c = canvas.data;
  const total = c ? c.sources.reduce((a, s) => a + s.entityCount, 0) : 0;
  const disclosure = c?.meta.disclosure ?? ACCELERATOR_DISCLOSURE_TEXT;
  const needsReview = c?.badges.needsReview ?? 0;
  const freshState = !c
    ? "empty"
    : total === 0
      ? "empty"
      : c.badges.e8StaleSources.length > 0
        ? "reconciling"
        : "fresh";

  const toggleTheme = (): void => {
    const root = document.documentElement;
    root.dataset.theme = root.dataset.theme === "light" ? "dark" : "light";
  };

  return (
    <AppContext.Provider value={app}>
      <div className="app">
        <div className="brand" title="ctx guide">
          <span className="glyph">ctx</span>
        </div>

        <header className="topbar">
          <div className="repo">
            <span className="name">this repo</span>
            <span className="meta num">
              {total.toLocaleString()} entities · {c ? c.sources.length : 0} sources
            </span>
          </div>
          <span className="spacer" />
          <span
            className="fresh"
            data-state={freshState}
            title="Startup RefreshEngine catch-up (R10)"
          >
            <span className="dot" />
            {freshState === "empty" ? "no index" : freshState === "reconciling" ? "reconciling" : "fresh"}
          </span>
          <button type="button" className="kbd-btn" onClick={() => setPaletteOpen(true)}>
            <MagnifyingGlass size={14} weight="bold" />
            Search everything
            <kbd>⌘K</kbd>
          </button>
          <button type="button" className="icon-btn" onClick={toggleTheme} aria-label="Toggle theme">
            <Sun size={16} />
          </button>
        </header>

        <div className="banner" role="note" aria-label="disclosure">
          <span className="tag">accelerator</span>
          <span>{disclosure}</span>
        </div>

        <nav className="rail" aria-label="Primary">
          <button
            type="button"
            aria-current={route.view === "orient"}
            title="Orient — what is this repo (J1)"
            onClick={() => navigate({ view: "orient" })}
          >
            <House size={19} />
          </button>
          <button
            type="button"
            aria-current={route.view === "review"}
            title="Review — needs-review, conflicts, push (J4)"
            onClick={() => navigate({ view: "review", tab: "queue" })}
          >
            <ClipboardText size={19} />
            {needsReview > 0 && <span className="badge num">{needsReview}</span>}
          </button>
          <button
            type="button"
            title="Find — search all entity kinds (J2)"
            onClick={() => setPaletteOpen(true)}
          >
            <MagnifyingGlass size={19} />
          </button>
          <span className="sep" />
          <button
            type="button"
            aria-current={legendOpen}
            title="Claim-status legend (J5)"
            onClick={() => setLegendOpen((v) => !v)}
          >
            <Info size={19} />
          </button>
        </nav>

        <main className="main">
          {route.view === "orient" && <Orient canvas={canvas} />}
          {route.view === "subject" && <Subject refId={route.ref} />}
          {route.view === "review" && <Review tab={route.tab} />}
        </main>
      </div>

      {legendOpen && (
        <div className="drawer-scrim" onClick={() => setLegendOpen(false)}>
          <div
            className="drawer"
            role="dialog"
            aria-label="Claim status legend"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="close" onClick={() => setLegendOpen(false)}>
              Close
            </button>
            <h2>Trust legend</h2>
            <p className="dim" style={{ fontSize: 12.5, marginTop: 0 }}>
              The only color anywhere is a claim's status. Click a status to focus it across this
              surface. Derivation is the mark shape (● observed · ▪ declared · ◌ inferred), confidence
              is the tick stack, freshness is opacity.
            </p>
            <ClaimLegend
              counts={scope.counts}
              active={focus ?? new Set<ClaimStatus>(STATUS_ORDER)}
              onToggle={toggleFocus}
              scope={scope.label}
            />
          </div>
        </div>
      )}

      {evidence && (
        <>
          <div className="drawer-scrim" onClick={() => setEvidence(null)} />
          <EvidenceDrawer evidence={evidence} onClose={() => setEvidence(null)} />
        </>
      )}

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} />}
    </AppContext.Provider>
  );
}
