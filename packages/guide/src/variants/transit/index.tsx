// transit — "Transit Diagram": a metro network map for change flow.
// The Change Trace draws ROUTES; wayfinding signage over a deep-slate field.
// COLOR BUDGET (D15): transit lines stay NEUTRAL (luminance / width / dash
// pattern differentiate them); ALL saturation is spent on the claim-status
// marks (conflict / needs-review). See NOTES.md.

import type { ReactNode } from "react";
import type { AtlasEdge, NodeStatus, RailStep } from "../../atlas/types.js";
import type { EdgeGeometry, NodeContentProps, RailStepProps, VariantSpec } from "../types.js";
// Signage voice (region station-boards) + mono (paths / hop codes). Installed
// packages only — no CDN, no remote assets. We import the axis CSS files
// directly: archivo/wdth.css carries BOTH the weight and width axes (board
// type needs the width axis), jetbrains-mono/wght.css the weight axis. Direct
// .css imports are typed by vite/client, so no ambient module decl is needed
// (which would otherwise collide with sibling variants importing the same font).
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./transit.css";

// Very-low-chroma blue-gray district fill; barely-there lightness step by depth.
function districtFill(depth: number): string {
  const light = 10.5 + Math.min(depth, 6) * 2.1;
  return `hsl(212 17% ${light}%)`;
}

function StatusMark({ status }: { status: NodeStatus }) {
  // active = neutral gray tick (no saturation, no letter). Only conflict /
  // needs-review spend saturated ink, as a perimeter chip + letterform.
  if (status === "active") return <span className="tr-tick tr-tick-active" aria-hidden="true" />;
  const letter = status === "conflict" ? "C" : "R";
  return (
    <span className={`tr-chip tr-chip-${status}`} title={status} aria-label={status}>
      <span className="tr-chip-letter">{letter}</span>
    </span>
  );
}

function NodeContent({ node, lit, dimmed, focused }: NodeContentProps) {
  const cls = ["tr-node", `tr-${node.kind}`, lit && "tr-lit", dimmed && "tr-dimmed", focused && "tr-focused"]
    .filter(Boolean)
    .join(" ");

  if (node.kind === "folder") {
    // District: region body carries a depth-tinted fill; header = station-board plate.
    return (
      <div className={cls} title={node.path} style={{ background: districtFill(node.depth) }}>
        <div className="tr-plate">
          <span className="tr-plate-name">{node.name}</span>
        </div>
      </div>
    );
  }

  if (node.kind === "file") {
    // Station marker. Interchange (bold 2px ring) when the file carries decls;
    // a plain halt (1px ring) otherwise. footprint>1 is the non-invented signal.
    const interchange = node.footprint > 1;
    return (
      <div className={`${cls} ${interchange ? "tr-interchange" : "tr-halt"}`} title={node.path}>
        <span className="tr-file-name">{node.name}</span>
        <StatusMark status={node.status} />
        {node.overflow > 0 ? <span className="tr-overflow">+{node.overflow}</span> : null}
      </div>
    );
  }

  // decl = small square platform cell inside its station.
  return (
    <div className={cls} title={node.path}>
      <StatusMark status={node.status} />
    </div>
  );
}

// --- Change Trace route drawing (D22/D23) --------------------------------
// Orthogonal routing with a single 45° chamfered bend (3 segments) computed
// from geometry. calls = solid line, imports = dash-dot; weight tracks the
// geometry strokeWidth. Stop dots sit at both endpoints.
function EdgePath(edge: AtlasEdge, geo: EdgeGeometry): ReactNode {
  const dx = geo.x2 - geo.x1;
  const dy = geo.y2 - geo.y1;
  const chamfer = Math.min(Math.abs(dx), Math.abs(dy), 16);
  const sx = Math.sign(dx) || 1;
  const sy = Math.sign(dy) || 1;
  const d = `M ${geo.x1} ${geo.y1} L ${geo.x2 - sx * chamfer} ${geo.y1} L ${geo.x2} ${geo.y1 + sy * chamfer} L ${geo.x2} ${geo.y2}`;
  const width = Math.max(geo.strokeWidth, 1);
  return (
    <g className={`tr-route tr-route-${edge.kind}`}>
      <path className="tr-line" d={d} fill="none" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
      <circle className="tr-stop-dot" cx={geo.x1} cy={geo.y1} r={3} />
      <circle className="tr-stop-dot" cx={geo.x2} cy={geo.y2} r={3} />
    </g>
  );
}

// --- Evidence Rail as a route list --------------------------------------
function LineGlyph({ kind }: { kind: RailStep["edgeKind"] }) {
  if (kind === "anchor") {
    return (
      <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden="true" className="tr-glyph">
        <circle cx="8" cy="4" r="2.6" className="tr-glyph-anchor" />
      </svg>
    );
  }
  const dash = kind === "imports" ? "1 3 5 3" : kind === "contains" ? "2 2.5" : undefined;
  const width = kind === "calls" ? 3 : kind === "imports" ? 2.5 : 1;
  return (
    <svg width="16" height="8" viewBox="0 0 16 8" aria-hidden="true" className="tr-glyph">
      <line
        x1="1"
        y1="4"
        x2="15"
        y2="4"
        className={`tr-glyph-line tr-glyph-${kind}`}
        strokeWidth={width}
        strokeDasharray={dash}
        strokeLinecap="round"
      />
    </svg>
  );
}

function RailStepRow({ step, focused, onFocus }: RailStepProps) {
  const cls = `tr-stop${focused ? " tr-stop-focused" : ""}`;
  return (
    <button type="button" className={cls} onClick={() => onFocus(step.nodeId)} title={step.path}>
      <span className="tr-stop-glyph">
        <LineGlyph kind={step.edgeKind} />
      </span>
      <span className="tr-stop-main">
        <span className="tr-stop-name">{step.label}</span>
        <span className="tr-stop-path">{step.path}</span>
        <span className="tr-stop-prov">{step.provenance}</span>
      </span>
      <span className="tr-hop">H{step.hop}</span>
    </button>
  );
}

// --- Chrome: wayfinding legend plate ------------------------------------
function Legend() {
  return (
    <div className="tr-legend">
      <div className="tr-legend-title">Wayfinding</div>
      <div className="tr-legend-grid">
        <span className="tr-legend-sample">
          <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden="true">
            <line x1="1" y1="4" x2="25" y2="4" className="tr-legend-calls" strokeWidth="3" strokeLinecap="round" />
          </svg>
        </span>
        <span className="tr-legend-label">calls</span>
        <span className="tr-legend-sample">
          <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden="true">
            <line
              x1="1"
              y1="4"
              x2="25"
              y2="4"
              className="tr-legend-imports"
              strokeWidth="2.5"
              strokeDasharray="1 3 5 3"
              strokeLinecap="round"
            />
          </svg>
        </span>
        <span className="tr-legend-label">imports</span>
        <span className="tr-legend-sample">
          <svg width="26" height="8" viewBox="0 0 26 8" aria-hidden="true">
            <line x1="1" y1="4" x2="25" y2="4" className="tr-legend-backbone" strokeWidth="1" />
          </svg>
        </span>
        <span className="tr-legend-label">backbone</span>
        <span className="tr-legend-sample">
          <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true">
            <circle cx="13" cy="5" r="3.2" className="tr-legend-dot" />
          </svg>
        </span>
        <span className="tr-legend-label">stop</span>
        <span className="tr-legend-sample">
          <span className="tr-legend-district" />
        </span>
        <span className="tr-legend-label">dimmed district</span>
      </div>
      <div className="tr-legend-title tr-legend-status-title">Claim status</div>
      <div className="tr-legend-grid">
        <span className="tr-legend-sample">
          <span className="tr-chip tr-chip-conflict tr-legend-chip">
            <span className="tr-chip-letter">C</span>
          </span>
        </span>
        <span className="tr-legend-label">conflict</span>
        <span className="tr-legend-sample">
          <span className="tr-chip tr-chip-needs-review tr-legend-chip">
            <span className="tr-chip-letter">R</span>
          </span>
        </span>
        <span className="tr-legend-label">needs-review</span>
        <span className="tr-legend-sample">
          <span className="tr-tick tr-tick-active tr-legend-tick" />
        </span>
        <span className="tr-legend-label">active</span>
      </div>
    </div>
  );
}

const spec: VariantSpec = {
  id: "transit",
  label: "Transit Diagram",
  description:
    "Mid-dark metro network map: the Change Trace draws neutral transit routes; saturation only on claim-status marks.",
  themeClass: "variant-transit",
  NodeContent,
  EdgePath,
  RailStep: RailStepRow,
  ChromeSlots: {
    // hudExtra omitted: the HUD's gen/rev/counts are already legible on the
    // slate theme; a duplicate plate would only add redundant chrome.
    legend: Legend,
  },
};

export default spec;
