/**
 * The D28 shell: top bar · left rail · centre canvas · right inspector.
 *
 * THE ONE STRUCTURAL RULE D28 SPELLS OUT, and the reason it does:
 *
 *   "The inspector and the rail are INDEPENDENT scroll owners with reserved height budgets —
 *    never one flex column."
 *
 * So this is a CSS grid with three fixed tracks and a full-height row, not a flex row of
 * things that push each other around. Each of the three panes is `h-full min-h-0` and owns
 * its own overflow. Put the rail and the inspector in one column and the rail becomes
 * unreachable the moment the inspector has content — which, on a real repository, is
 * immediately.
 *
 * NARROW (<1100px, D13's floor): the tree and the inspector become drawers and the canvas
 * keeps the whole width. The canvas ASKS for a wider viewport rather than pretending to be a
 * phone map — it does not re-project itself, it does not drop nodes, and it does not switch
 * to a list. The map is a desktop object and says so.
 */
import { useEffect, useState } from "react";
import type { BoundedProjection, GuideStatus, GuideTree } from "../data/dto.ts";
import { CanvasHost } from "../canvas/CanvasHost.tsx";
import { Inspector } from "../inspector/Inspector.tsx";
import { Rail } from "../rail/Rail.tsx";
import { TopBar } from "../ui/TopBar.tsx";
import { useView } from "../state/view.ts";

/** D13's desktop floor. Below it the side panes are drawers. */
export const NARROW_PX = 1100;

export function Shell(props: {
  status: GuideStatus | undefined;
  overview: BoundedProjection;
  tree: GuideTree;
}): React.ReactNode {
  const narrow = useNarrow();
  const railOpen = useView((s) => s.railOpen);
  const inspectorOpen = useView((s) => s.inspectorOpen);
  const setRailOpen = useView((s) => s.setRailOpen);
  const setInspectorOpen = useView((s) => s.setInspectorOpen);

  return (
    <div
      data-testid="shell"
      data-narrow={narrow ? "true" : "false"}
      className="flex h-screen w-screen flex-col overflow-hidden bg-zinc-950 text-zinc-200"
    >
      <TopBar status={props.status} narrow={narrow} />

      {narrow ? (
        <div className="relative min-h-0 flex-1">
          <main data-testid="canvas-host" className="h-full w-full">
            <CanvasHost overview={props.overview} tree={props.tree} />
          </main>

          {/* A drawer is an overlay with its OWN scroll container — the canvas keeps its
              height budget underneath, and the drawer does not share one with anything. */}
          <Drawer side="left" open={railOpen} onClose={() => setRailOpen(false)} label="Tree">
            <Rail tree={props.tree} />
          </Drawer>
          <Drawer
            side="right"
            open={inspectorOpen}
            onClose={() => setInspectorOpen(false)}
            label="Inspector"
          >
            <Inspector overview={props.overview} tree={props.tree} />
          </Drawer>

          <p
            data-testid="narrow-notice"
            className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded border border-zinc-700 bg-zinc-950/95 px-3 py-1.5 text-xs text-zinc-400"
          >
            The map wants a viewport at least {NARROW_PX}px wide. Tree and Inspector are in
            drawers.
          </p>
        </div>
      ) : (
        // Three fixed tracks. `minmax(0,1fr)` on the centre is what stops a wide card from
        // pushing the canvas past its column and stealing the rail's width.
        <div
          className="grid min-h-0 flex-1 grid-cols-[260px_minmax(0,1fr)_340px]"
          data-testid="shell-grid"
        >
          <aside className="h-full min-h-0 overflow-hidden border-r border-zinc-800">
            <Rail tree={props.tree} />
          </aside>

          <main data-testid="canvas-host" className="h-full min-h-0 overflow-hidden">
            <CanvasHost overview={props.overview} tree={props.tree} />
          </main>

          <aside className="h-full min-h-0 overflow-hidden">
            <Inspector overview={props.overview} tree={props.tree} />
          </aside>
        </div>
      )}
    </div>
  );
}

function Drawer(props: {
  side: "left" | "right";
  open: boolean;
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}): React.ReactNode {
  if (!props.open) return null;
  return (
    <div className="absolute inset-0 z-20 flex">
      <button
        type="button"
        aria-label={`Close ${props.label}`}
        onClick={props.onClose}
        className={`absolute inset-0 bg-black/50 ${props.side === "left" ? "" : ""}`}
      />
      <div
        data-testid={`drawer-${props.side}`}
        className={[
          "relative z-10 h-full w-[320px] max-w-[85vw] border-zinc-800 bg-zinc-950 shadow-xl",
          props.side === "left" ? "border-r" : "ml-auto border-l",
        ].join(" ")}
      >
        {props.children}
      </div>
    </div>
  );
}

/** One breakpoint, one floor. No mobile layout — D13/U7 deferred it, deliberately. */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < NARROW_PX,
  );

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${NARROW_PX - 1}px)`);
    const update = (): void => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return narrow;
}
