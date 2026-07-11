/**
 * App shell — DR-01 quiet bar (standing, exact ACCELERATOR_DISCLOSURE), top nav
 * (Canvas / Subject / Inspector), the runtime skin selector (?skin=, C11), and the
 * shared Evidence Drawer. Hash routing keeps the surface swap dependency-free;
 * the Claim Legend's active-status filter is app state shared across surfaces.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { EvidencePacket, ClaimStatus } from "@contexa/core";
import { ACCELERATOR_DISCLOSURE_TEXT } from "./constants.ts";
import { SKINS, currentSkin, setSkin, type Skin } from "./skins.ts";
import { EvidenceDrawer } from "./components/EvidenceDrawer.tsx";
import { Canvas } from "./surfaces/Canvas.tsx";
import { Subject } from "./surfaces/Subject.tsx";
import { Inspector } from "./surfaces/Inspector.tsx";

type Route =
  | { name: "canvas" }
  | { name: "subject"; ref: string }
  | { name: "inspector" };

function parseHash(): Route {
  const h = window.location.hash.replace(/^#/, "");
  if (h.startsWith("subject/")) return { name: "subject", ref: decodeURIComponent(h.slice("subject/".length)) };
  if (h === "inspector") return { name: "inspector" };
  return { name: "canvas" };
}

export function App(): React.ReactElement {
  const [route, setRoute] = useState<Route>(parseHash);
  const [skin, setSkinState] = useState<Skin>(currentSkin);
  const [drawer, setDrawer] = useState<EvidencePacket | null>(null);
  const [active, setActive] = useState<Set<ClaimStatus>>(new Set());

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const nav = useCallback((r: Route) => {
    const hash =
      r.name === "canvas" ? "" : r.name === "inspector" ? "#inspector" : `#subject/${encodeURIComponent(r.ref)}`;
    window.location.hash = hash;
    setRoute(r);
  }, []);

  const openSubject = useCallback((ref: string) => nav({ name: "subject", ref }), [nav]);
  const openEvidence = useCallback((e: EvidencePacket) => setDrawer(e), []);
  const toggleStatus = useCallback((s: ClaimStatus) => {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }, []);

  const onSkin = useCallback((s: Skin) => {
    setSkin(s);
    setSkinState(s);
  }, []);

  const surface = useMemo(() => {
    switch (route.name) {
      case "subject":
        return <Subject refId={route.ref} onOpenSubject={openSubject} onOpenEvidence={openEvidence} />;
      case "inspector":
        return <Inspector onOpenEvidence={openEvidence} />;
      default:
        return (
          <Canvas
            active={active}
            onToggleStatus={toggleStatus}
            onOpenSubject={openSubject}
            onOpenEvidence={openEvidence}
          />
        );
    }
  }, [route, active, openSubject, openEvidence, toggleStatus]);

  return (
    <div className="app">
      <div className="dr01" role="note">
        {ACCELERATOR_DISCLOSURE_TEXT}
      </div>
      <nav className="topnav">
        <span className="brand">ctx guide</span>
        <button
          type="button"
          className="tab"
          aria-current={route.name === "canvas" ? "page" : undefined}
          onClick={() => nav({ name: "canvas" })}
        >
          Canvas
        </button>
        <button
          type="button"
          className="tab"
          aria-current={route.name === "subject" ? "page" : undefined}
          onClick={() => (route.name === "subject" ? undefined : nav({ name: "canvas" }))}
          disabled={route.name !== "subject"}
        >
          Subject
        </button>
        <button
          type="button"
          className="tab"
          aria-current={route.name === "inspector" ? "page" : undefined}
          onClick={() => nav({ name: "inspector" })}
        >
          Inspector
        </button>
        <span className="grow" />
        <label>
          <span className="mono" style={{ color: "var(--ink-dim)", marginRight: 6 }}>
            skin
          </span>
          <select
            className="skinsel"
            value={skin}
            onChange={(e) => onSkin(e.target.value as Skin)}
            aria-label="Design skin"
          >
            {SKINS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </nav>
      <main className="main">{surface}</main>
      <EvidenceDrawer evidence={drawer} onClose={() => setDrawer(null)} />
    </div>
  );
}
