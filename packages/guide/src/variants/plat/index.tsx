// Variant: Surveyor's Plat (`plat`).
// The repo rendered as a county land-registry plat map: folders are tracts,
// files are lots, declarations are parcels. Authority and record-keeping.
// Hierarchy is carried purely by line weight (like a real cadastral plat), not
// by shadow or radius. Saturated color is spent ONLY on the three claim
// statuses (D11/D15); activity is neutral luminance. Everything is scoped under
// `.variant-plat` (see plat.css).

import "@fontsource-variable/ibm-plex-sans/index.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";

import type { CSSProperties } from "react";
import type { AtlasEdge } from "../../atlas/types.js";
import type { EdgeGeometry, NodeContentProps, RailStepProps, VariantSpec } from "../types.js";
import "./plat.css";

// A barely-there blue tint step per depth. Tracts (folders) read a touch deeper
// than the lots stacked on top of them, so the land backdrop shows in the
// margins between lots. All cool (slate-blue leaning), never warm.
const TRACT_TINTS = ["#e9eef5", "#e2e9f2", "#dbe3ee", "#d5deeb", "#cfd9e8", "#c9d4e5"];
const LOT_TINTS = ["#f6f8fb", "#f1f4f9", "#ebeff6", "#e5ebf3", "#dfe6f0", "#d9e1ec"];
const PARCEL_FILL = "#dbe3ef";

function lotFill(node: NodeContentProps["node"]): string {
  if (node.kind === "folder") return TRACT_TINTS[Math.min(node.depth, TRACT_TINTS.length - 1)];
  if (node.kind === "decl") return PARCEL_FILL;
  return LOT_TINTS[Math.min(node.depth, LOT_TINTS.length - 1)];
}

// Letterform glyph for non-color status access (D15). Active is neutral: no glyph.
function statusGlyph(status: NodeContentProps["node"]["status"]): string {
  return status === "conflict" ? "C" : status === "needs-review" ? "R" : "";
}

function NodeContent({ node, lit, dimmed, focused }: NodeContentProps) {
  const classes = [
    "plat-node",
    `plat-${node.kind}`,
    lit ? "plat-lit" : "",
    dimmed ? "plat-dimmed" : "",
    focused ? "plat-focused" : "",
  ]
    .filter(Boolean)
    .join(" ");

  // Density gate: parcels (decls) are label-free below readable size; a
  // footprint-1 lot is too small for a label. Hover title keeps access.
  const showLabel = node.kind === "folder" || (node.kind === "file" && node.footprint >= 2);
  const glyph = statusGlyph(node.status);
  // Active ticks would swamp the highest-density parcel layer; render the
  // neutral active tick on tracts and lots, and only R/C ticks on parcels.
  const showTick = node.kind !== "decl" || node.status !== "active";
  const style = { ["--lot-fill" as string]: lotFill(node) } as CSSProperties;

  return (
    <div className={classes} style={style} title={node.path}>
      {showTick ? (
        <span className={`plat-tick plat-status-${node.status}`} aria-hidden="true">
          {glyph && showLabel ? <span className="plat-tick-glyph">{glyph}</span> : null}
        </span>
      ) : null}
      {showLabel && node.kind === "folder" ? (
        <div className="plat-label plat-sheet-title">{node.name}</div>
      ) : showLabel && node.kind === "file" ? (
        <div className="plat-label plat-lot-label">{node.name}</div>
      ) : null}
      {node.overflow > 0 ? <span className="plat-parcel-count">+{node.overflow}</span> : null}
    </div>
  );
}

// Thin straight surveyor lines. Calls solid, imports dashed (pattern = kind).
// Neutral ink, no arrowheads; a tiny square origin tick marks the source end.
function EdgePath(edge: AtlasEdge, g: EdgeGeometry) {
  const dashed = edge.kind === "imports";
  const ink = "var(--edge-ink, #3b4658)";
  return (
    <g className="plat-edge" key={`${edge.kind}:${edge.src}:${edge.dst}`}>
      <line
        x1={g.x1}
        y1={g.y1}
        x2={g.x2}
        y2={g.y2}
        stroke={ink}
        strokeWidth={g.strokeWidth}
        strokeLinecap="butt"
        strokeDasharray={dashed ? "3 2" : undefined}
      />
      <rect x={g.x1 - 1.5} y={g.y1 - 1.5} width={3} height={3} fill={ink} />
    </g>
  );
}

// A register ledger row. Hop distance (the real traversal metric the rail is
// ordered by) is the mono ledger ordinal; path + provenance keep the evidence.
function RailStep({ step, focused, onFocus }: RailStepProps) {
  const cls = `plat-rail-row${focused ? " plat-rail-row-focused" : ""}`;
  return (
    <button type="button" className={cls} onClick={() => onFocus(step.nodeId)} title={step.path}>
      <span className="plat-rail-ord">{String(step.hop).padStart(2, "0")}</span>
      <span className="plat-rail-body">
        <span className="plat-rail-label">{step.label}</span>
        <span className="plat-rail-path">{step.path}</span>
        <span className="plat-rail-prov">{step.provenance}</span>
      </span>
      <span className="plat-rail-kind">{step.edgeKind}</span>
    </button>
  );
}

// Compact plat legend: line-weight samples, the Change Trace hatch, and the
// three status ticks with labels.
function Legend() {
  return (
    <div className="plat-legend" aria-label="Plat legend">
      <div className="plat-legend-title">Plat legend</div>
      <ul className="plat-legend-list">
        <li>
          <span className="plat-swatch plat-swatch-tract" aria-hidden="true" /> Tract (folder)
        </li>
        <li>
          <span className="plat-swatch plat-swatch-lot" aria-hidden="true" /> Lot (file)
        </li>
        <li>
          <span className="plat-swatch plat-swatch-parcel" aria-hidden="true" /> Parcel (decl)
        </li>
        <li>
          <span className="plat-swatch plat-swatch-hatch" aria-hidden="true" /> In Change Trace
        </li>
      </ul>
      <ul className="plat-legend-list plat-legend-status">
        <li>
          <span className="plat-tick plat-status-active plat-legend-tick" aria-hidden="true" /> Active
        </li>
        <li>
          <span className="plat-tick plat-status-needs-review plat-legend-tick" aria-hidden="true">
            <span className="plat-tick-glyph">R</span>
          </span>{" "}
          Needs review
        </li>
        <li>
          <span className="plat-tick plat-status-conflict plat-legend-tick" aria-hidden="true">
            <span className="plat-tick-glyph">C</span>
          </span>{" "}
          Conflict
        </li>
      </ul>
    </div>
  );
}

// Minimal mono sheet caption. Generation + revision already read in the HUD, so
// this stays a plain cartographic caption and fabricates no numbers.
function HudExtra() {
  return <span className="plat-sheet-caption">Cadastral projection</span>;
}

const spec: VariantSpec = {
  id: "plat",
  label: "Surveyor's Plat",
  description:
    "Light cadastral registry: folders as tracts, files as lots, decls as parcels. Line-weight hierarchy; saturated color only on claim status.",
  themeClass: "variant-plat",
  NodeContent,
  EdgePath,
  RailStep,
  ChromeSlots: { hudExtra: HudExtra, legend: Legend },
};

export default spec;
