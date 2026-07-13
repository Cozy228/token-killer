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
