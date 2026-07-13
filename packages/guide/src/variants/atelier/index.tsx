// atelier "Museum Atlas". A light gallery exhibition floor: the codebase
// curated as a museum wing. Editorial serif titles, floated plates with soft
// physical depth, recessed matte region zones, engraved decl cells. Depth is
// the storytelling mechanic for the Change Trace: lit plates LIFT, dimmed
// plates FLATTEN. Saturated color is spent ONLY on the three claim statuses.
//
// Fonts: installed @fontsource-variable packages only. No CDN, no remote assets.

import type { AtlasEdge } from "../../atlas/types.js";
import type { EdgeGeometry, NodeContentProps, RailStepProps, VariantSpec } from "../types.js";
// Explicit /index.css subpath (identical to the bare specifier's `.` export)
// so vite/client's `declare module '*.css'` covers it; no substrate type shim.
import "@fontsource-variable/source-serif-4/index.css";
import "@fontsource-variable/public-sans/index.css";
import "@fontsource-variable/jetbrains-mono/index.css";
import "./atelier.css";

/** Pixels per world unit (mirrors the renderer seam; kept local to stay self-contained). */
const UNIT_PX = 14;
/** Below this on-screen width, a lot is too small to carry a label (lowest density). */
const SMALL_PX = 40;

const TICK_LETTER: Record<string, string> = {
  conflict: "C",
  "needs-review": "R",
};

function NodeContent({ node, lit, dimmed, focused }: NodeContentProps) {
  const isSmall = node.rect.w * UNIT_PX < SMALL_PX || node.rect.h * UNIT_PX < 20;
  const classes = [
    "atelier-node",
    `atelier-${node.kind}`,
    isSmall ? "atelier-small" : "",
    lit ? "lit" : "",
    dimmed ? "dimmed" : "",
    focused ? "focused" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Perimeter tick: accent for the two claim statuses, neutral for active files.
  const showTick =
    node.status === "conflict" ||
    node.status === "needs-review" ||
    (node.status === "active" && node.kind === "file");
  const letter = TICK_LETTER[node.status];

  return (
    <div className={classes} title={node.path}>
      {showTick ? <span className={`atelier-tick atelier-status-${node.status}`} aria-hidden="true" /> : null}
      {letter ? (
        <span className={`atelier-tick-letter letter-${node.status}`} title={node.status}>
          {letter}
        </span>
      ) : null}

      {node.kind === "folder" ? (
        <div className="atelier-region-title">{node.name}/</div>
      ) : node.kind === "file" ? (
        <div className="atelier-file-label">{node.name}</div>
      ) : null}

      {node.overflow > 0 ? <span className="atelier-overflow">+{node.overflow} further works</span> : null}
    </div>
  );
}

/** Quiet light-ink bezier. Single cubic path from geometry; width from strokeWidth.
 *  Calls solid, imports dashed. Faint backbone by default; substrate marks .lit. */
function EdgePath(edge: AtlasEdge, geometry: EdgeGeometry) {
  const { x1, y1, x2, y2, strokeWidth } = geometry;
  const mx = (x1 + x2) / 2;
  const d = `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`;
  return (
    <path
      className={`atelier-edge atelier-edge--${edge.kind}`}
      d={d}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
    />
  );
}

/** Wall-label card: label (Public Sans medium), path (mono, dim), provenance +
 *  hop + edge kind (caption). Most whitespace of the four variants. No stripes. */
function RailStep({ step, focused, onFocus }: RailStepProps) {
  return (
    <button
      type="button"
      className={`atelier-rail-card${focused ? " focused" : ""}`}
      onClick={() => onFocus(step.nodeId)}
      title={step.path}
    >
      <span className="atelier-card-label">{step.label}</span>
      <span className="atelier-card-path">{step.path}</span>
      <span className="atelier-card-caption">
        hop {step.hop} · {step.edgeKind} · {step.provenance}
      </span>
    </button>
  );
}

/** Exhibit legend card: serif heading, tick samples, lift-vs-flat sample. */
function Legend() {
  return (
    <div className="atelier-legend" aria-label="Legend">
      <h2 className="atelier-legend-heading">Legend</h2>

      <div className="atelier-legend-caption">Claim status</div>
      <div className="atelier-legend-group">
        <div className="atelier-legend-row">
          <span className="atelier-swatch atelier-swatch-tick sw-conflict" aria-hidden="true" />
          <span className="atelier-legend-letter letter-conflict">C</span>
          <span>Conflict</span>
        </div>
        <div className="atelier-legend-row">
          <span className="atelier-swatch atelier-swatch-tick sw-needs-review" aria-hidden="true" />
          <span className="atelier-legend-letter letter-needs-review">R</span>
          <span>Needs review</span>
        </div>
        <div className="atelier-legend-row">
          <span className="atelier-swatch atelier-swatch-tick sw-active" aria-hidden="true" />
          <span className="atelier-legend-letter" aria-hidden="true" />
          <span>Active (neutral)</span>
        </div>
      </div>

      <div className="atelier-legend-caption">Change Trace</div>
      <div className="atelier-legend-group">
        <div className="atelier-legend-row">
          <span className="atelier-swatch atelier-swatch-lift" aria-hidden="true" />
          <span>Lifted (in the trace)</span>
        </div>
        <div className="atelier-legend-row">
          <span className="atelier-swatch atelier-swatch-flat" aria-hidden="true" />
          <span>Flattened (off the trace)</span>
        </div>
      </div>
    </div>
  );
}

const spec: VariantSpec = {
  id: "atelier",
  label: "Museum Atlas",
  description: "Light gallery exhibition floor; editorial serif titles, floated plates, depth carries the Change Trace.",
  themeClass: "variant-atelier",
  NodeContent,
  EdgePath,
  RailStep,
  ChromeSlots: {
    // hudExtra omitted: the substrate HUD (repo, revision, generations, scale,
    // variant, fit, sweep) is already complete; a gallery-styled duplicate would
    // add nothing non-redundant.
    legend: Legend,
  },
};

export default spec;
