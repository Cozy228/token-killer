// GraphRenderer — the D12 renderer seam. The rest of the app talks to this
// contract; only ReactFlowRenderer (behind this seam) may import @xyflow/react.
// If the 10x spike ever fails, a WebGL far-level renderer can replace the impl
// without changing this contract.

import type { AtlasEdge, AtlasNode, VisibleSlice, Viewport } from "../atlas/types.js";
import type { VariantSpec } from "../variants/types.js";
import { ReactFlowRenderer } from "./ReactFlowRenderer.js";

/** Pixels per world unit. */
export const UNIT = 14;

export interface LitState {
  litNodeIds: Set<string>;
  hasEvent: boolean;
}

export interface RendererApi {
  setViewport(viewport: Viewport): void;
  fitView(): void;
  /**
   * Reveal a node's world rect ONLY if it is offscreen or its on-screen width is
   * below `minPx` (R4-1). Otherwise no camera move. Returns whether it moved.
   */
  revealNode(rect: Viewport, minPx?: number): boolean;
  /**
   * Deterministically CENTER a node's world rect at a fixed reading zoom (5c
   * fold-in): rail/search focus must land the same way across variants, never
   * "too far out". Always moves the camera (unlike revealNode).
   */
  centerOn(rect: Viewport, targetZoom: number): void;
  /** Scripted 3s viewport tour; resolves after recording fps into onFps. */
  runSweep(onFps: (fps: number) => void): Promise<void>;
}

export interface GraphRendererProps {
  slice: VisibleSlice;
  litState: LitState;
  focusedId: string | null;
  variant: VariantSpec;
  /**
   * World-unit viewport to open on (event bbox or fit). The renderer converts
   * it to a React Flow `defaultViewport` computed from the measured pane BEFORE
   * first mount, so an identity/whole-map first paint is impossible when a
   * projection exists (defect 1/4).
   */
  initialViewport: Viewport;
  /**
   * Current world viewport (committed slice viewport). Used only by the edge
   * layer to stub selection edges whose far endpoint is off-screen. Optional.
   */
  viewport?: Viewport;
  onFocus: (nodeId: string) => void;
  onViewportChange: (viewport: Viewport, zoom: number) => void;
  fitRequest: number;
  onApiReady?: (api: RendererApi) => void;
  /** Pane click / Esc clears selection (R4-1). */
  onClearSelection?: () => void;
  /** Double-click a folder region → drill/fit to it (R4-6). */
  onDrill?: (nodeId: string) => void;
  /**
   * Recent-lens recency bucket per FILE lot id (0 = most recent .. 3 = never).
   * Rendered as a neutral `recency-N` class on the lot wrapper (D11). Optional;
   * absent = no lens ramp.
   */
  recencyBuckets?: ReadonlyMap<string, number>;
}

export function edgeKey(edge: AtlasEdge): string {
  return `${edge.kind} ${edge.src} ${edge.dst}`;
}

export function nodeIsLit(node: AtlasNode, litState: LitState): boolean {
  return litState.hasEvent && litState.litNodeIds.has(node.id);
}

/**
 * Selection emphasis class for a node's React Flow wrapper (R4-1). Applied at
 * the substrate level so every variant inherits the fade/neighbor treatment.
 */
export function nodeSelectionClassName(
  nodeId: string,
  focusedId: string | null,
  neighborIds: ReadonlySet<string>,
): string {
  if (focusedId == null) return "";
  if (nodeId === focusedId) return "node-selected";
  if (neighborIds.has(nodeId)) return "node-neighbor";
  return "node-faded";
}

/**
 * Recent-lens class for a node's React Flow wrapper (D11). Only FILE lots carry
 * a neutral `recency-N` ramp class; folders/decls and un-bucketed files get none.
 * Orthogonal to selection — both classes coexist on the wrapper.
 */
export function fileRecencyClassName(
  node: AtlasNode,
  recencyBuckets: ReadonlyMap<string, number> | undefined,
): string {
  if (node.kind !== "file" || !recencyBuckets) return "";
  const bucket = recencyBuckets.get(node.id);
  return bucket === undefined ? "" : `recency-${bucket}`;
}

export function GraphRenderer(props: GraphRendererProps) {
  return <ReactFlowRenderer {...props} />;
}
