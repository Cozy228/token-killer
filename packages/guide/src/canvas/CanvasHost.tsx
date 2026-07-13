/**
 * The centre: the four-state canvas host (D27/D28).
 *
 * The canvas is PERMANENT — the centre never swaps for a different kind of page (D4). What
 * changes is which of the four projections it hosts. In this slice exactly one is
 * implemented; the other three are named, not stubbed with something that pretends to work.
 * A mode that says "slice G lands this" is honest. A mode that renders an empty canvas is
 * not.
 */
import type { BoundedProjection, GuideTree } from "../data/dto.ts";
import { useView } from "../state/view.ts";
import { OverviewCanvas } from "./overview/OverviewCanvas.tsx";

export function CanvasHost(props: {
  overview: BoundedProjection;
  tree: GuideTree;
}): React.ReactNode {
  const mode = useView((s) => s.mode);

  if (mode === "overview") {
    return <OverviewCanvas overview={props.overview} tree={props.tree} />;
  }

  return (
    <div
      data-testid="canvas-unbuilt"
      className="flex h-full items-center justify-center px-8 text-center text-sm text-zinc-500"
    >
      This canvas mode is not built yet.
    </div>
  );
}
