// instrument variant - "Flight Instrument" (dark cockpit, EFIS approach plate).
// Built for scanning a codebase under pressure: crisp 1px strokes and luminance
// steps only. NO glow, NO neon. Activity is neutral LUMINANCE (D9/D11/D15);
// saturated color is spent ONLY on the three claim statuses. Diff surface is the
// "Change Trace" (D24 naming gate).
//
// Fonts: IBM Plex Mono LEADS every label / readout / rail row; IBM Plex Sans is
// used only for multi-sentence copy. Only installed @fontsource packages.

import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource-variable/ibm-plex-sans/index.css";

import type { AtlasEdge } from "../../atlas/types.js";
import type { EdgeGeometry, NodeContentProps, RailStepProps, VariantSpec } from "../types.js";
import "./instrument.css";

// Two-letter status codes for non-color accessibility (readable-size mono).
const STATUS_CODE: Record<string, string> = {
  conflict: "CF",
  "needs-review": "NR",
};

// Edge-kind two-letter codes for the rail instrument stack.
const RAIL_CODE: Record<RailStepProps["step"]["edgeKind"], string> = {
  anchor: "AN",
  contains: "CT",
  calls: "CL",
  imports: "IM",
};

function NodeContent({ node, lit, dimmed, focused }: NodeContentProps) {
  // RECENCY is the intended luminance channel (recently touched files sit
  // brighter). node.status is NOT recency and props carry no recency, so we
  // encode DEPTH instead: shallower nodes read one to two luminance steps
  // brighter. This is the honest available channel (see NOTES.md).
  const depthStep = Math.min(node.depth, 4);
  const hasStatus = node.status === "conflict" || node.status === "needs-review";
  const code = STATUS_CODE[node.status];

  const classes = [
    "inst-node",
    `inst-${node.kind}`,
    `inst-d${depthStep}`,
    lit ? "inst-lit" : "",
    dimmed ? "inst-dimmed" : "",
    focused ? "inst-focused" : "",
    hasStatus ? `inst-status-${node.status}` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} title={node.path}>
      {hasStatus ? <span className={`inst-tick inst-tick-${node.status}`} aria-hidden /> : null}

      {node.kind === "folder" ? (
        <div className="inst-label inst-folder-label">{node.name}/</div>
      ) : node.kind === "file" ? (
        <div className="inst-label inst-file-label">{node.name}</div>
      ) : null}

      {hasStatus && node.kind !== "decl" ? <span className="inst-code">{code}</span> : null}

      {node.overflow > 0 ? (
        <span className="inst-overflow">
          <span className="inst-num">{node.overflow}</span>
          <span className="inst-unit">MORE</span>
        </span>
      ) : null}

      {focused ? (
        <span className="inst-reticle" aria-hidden>
          <span className="inst-corner inst-corner-tl" />
          <span className="inst-corner inst-corner-tr" />
          <span className="inst-corner inst-corner-bl" />
          <span className="inst-corner inst-corner-br" />
        </span>
      ) : null}
    </div>
  );
}

// ORTHOGONAL elbow with a 45-degree chamfered bend (approach-chart routing).
// calls = solid, imports = long-dash. Neutral steel stroke, width from the
// seam. No arrowheads; a 2px square terminal tick marks the destination.
function InstrumentEdge(edge: AtlasEdge, geometry: EdgeGeometry) {
  const { x1, y1, x2, y2, strokeWidth } = geometry;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  // Chamfer size clamped to the shorter leg so the bend never overshoots.
  const c = Math.min(Math.abs(dx), Math.abs(dy), 14);

  // Horizontal-first L with a 45-degree cut across the corner at (x2, y1).
  const ax = x2 - sx * c;
  const by = y1 + sy * c;
  const d = `M ${x1} ${y1} L ${ax} ${y1} L ${x2} ${by} L ${x2} ${y2}`;

  const dashed = edge.kind === "imports";

  return (
    <g className="inst-edge" pointerEvents="none">
      <path
        d={d}
        fill="none"
        stroke="var(--inst-edge, #4a515e)"
        strokeWidth={strokeWidth}
        strokeDasharray={dashed ? "9 5" : undefined}
        strokeLinejoin="miter"
        vectorEffect="non-scaling-stroke"
      />
      <rect
        x={x2 - 1}
        y={y2 - 1}
        width={2}
        height={2}
        fill="var(--inst-edge-tick, #6b7280)"
      />
    </g>
  );
}

// Rail instrument stack: fixed-height mono rows.
// [2-letter edge code] [label] [HOP n] with a dim second line for the path.
function RailStep({ step, focused, onFocus }: RailStepProps) {
  const code = RAIL_CODE[step.edgeKind];
  return (
    <button
      type="button"
      className={`inst-rail-row${focused ? " inst-rail-focused" : ""}`}
      onClick={() => onFocus(step.nodeId)}
      title={step.path}
    >
      <span className="inst-rail-line">
        <span className="inst-rail-code">{code}</span>
        <span className="inst-rail-label">{step.label}</span>
        <span className="inst-rail-hop">
          <span className="inst-unit">HOP</span>
          <span className="inst-num">{step.hop}</span>
        </span>
      </span>
      <span className="inst-rail-path">{step.path}</span>
    </button>
  );
}

// Legend: explains the edge-kind codes, the three status colors, and the
// luminance meaning. Multi-sentence copy uses IBM Plex Sans; keys are mono.
function Legend() {
  return (
    <div className="inst-legend">
      <div className="inst-legend-title">Instrument key</div>

      <div className="inst-legend-block">
        <div className="inst-legend-head">Trace codes</div>
        <ul className="inst-legend-list">
          <li>
            <span className="inst-rail-code">AN</span> anchors
          </li>
          <li>
            <span className="inst-rail-code">CT</span> contains
          </li>
          <li>
            <span className="inst-rail-code">CL</span> calls
          </li>
          <li>
            <span className="inst-rail-code">IM</span> imports
          </li>
        </ul>
      </div>

      <div className="inst-legend-block">
        <div className="inst-legend-head">Claim status</div>
        <ul className="inst-legend-list">
          <li>
            <span className="inst-code inst-code-conflict">CF</span> conflict
          </li>
          <li>
            <span className="inst-code inst-code-needs-review">NR</span> needs-review
          </li>
          <li>
            <span className="inst-swatch inst-swatch-active" aria-hidden /> active (neutral)
          </li>
        </ul>
      </div>

      <div className="inst-legend-block">
        <div className="inst-legend-head">Luminance</div>
        <p className="inst-legend-note">
          Brighter panels sit closer to the repo root; deeper folders step darker. Change Trace lit
          panels step up two stops with a near-white edge. Recency is the intended channel but is not
          available here, so depth stands in for it.
        </p>
      </div>
    </div>
  );
}

const spec: VariantSpec = {
  id: "instrument",
  label: "Flight Instrument",
  description:
    "Dark EFIS cockpit: neutral-luminance panels, saturated color only on claim status, orthogonal approach-chart edges.",
  themeClass: "variant-instrument",
  NodeContent,
  EdgePath: InstrumentEdge,
  RailStep,
  ChromeSlots: {
    // hudExtra intentionally omitted: it receives no props (cannot read live
    // counts without fabricating), and the substrate footer already shows the
    // visible/logical counts. See NOTES.md.
    legend: Legend,
  },
};

export default spec;
