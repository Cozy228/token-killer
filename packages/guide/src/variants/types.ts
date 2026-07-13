// VariantSpec seam. A design variant is a self-contained folder under
// src/variants/<slug>/ whose index.tsx default-exports a VariantSpec. Adding a
// variant must NOT require any substrate edit (registry auto-discovers it).
//
// Variant CSS MUST scope every rule under its `themeClass`. Structural layout
// (panel grid, sizes) stays in the substrate; variants only override tokens and
// the inner rendering of lots / decls / rail steps.

import type { FC, ReactNode } from "react";
import type { AtlasEdge, AtlasNode, RailStep } from "../atlas/types.js";

export interface NodeContentProps {
  node: AtlasNode;
  lit: boolean;
  dimmed: boolean;
  focused: boolean;
  /** Endpoint of the current selection's direct edges (R4-1). Optional/additive. */
  neighbor?: boolean;
  /** Faded because another node is selected and this one is unrelated (R4-1). */
  faded?: boolean;
  /** The decl cell is large enough to carry an inline name at this zoom (R4-5). */
  showDeclLabel?: boolean;
}

export interface RailStepProps {
  step: RailStep;
  focused: boolean;
  onFocus: (nodeId: string) => void;
}

export interface EdgeGeometry {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWidth: number;
  // Additive (R4-2): endpoints clipped to rect boundaries, midpoint, aggregated
  // count, and direction. Present when the renderer supplies them; variants that
  // predate these fields keep working with x1..y2.
  clippedX1?: number;
  clippedY1?: number;
  clippedX2?: number;
  clippedY2?: number;
  midX?: number;
  midY?: number;
  count?: number;
  direction?: "src->dst";
}

export interface VariantSpec {
  id: string;
  label: string;
  description: string;
  /** Root class; the variant's CSS scopes ALL its rules under this class. */
  themeClass: string;
  /** Inner rendering of a lot / decl node. */
  NodeContent: FC<NodeContentProps>;
  /** Optional custom edge drawing. */
  EdgePath?: (edge: AtlasEdge, geometry: EdgeGeometry) => ReactNode;
  /** Optional rail item renderer. */
  RailStep?: FC<RailStepProps>;
  /** Optional chrome slots. */
  ChromeSlots?: {
    hudExtra?: FC;
    legend?: FC;
  };
}
