/**
 * The perf HUD — DEV FLAG ONLY (D28: the spike shell is retired from the product surface).
 *
 * It is reachable at `#/?hud=1` and by no other route: there is no button, no menu item and
 * no keyboard shortcut for it. Every number on it is measured (the ELK wall-clock, the node
 * and edge counts actually laid out, the layout engine's own issue list) — a HUD that
 * estimates its own numbers is worse than no HUD.
 */
import type { LayoutIssue } from "./layout/elk.ts";

export function PerfHud(props: {
  layoutMs: number;
  nodes: number;
  edges: number;
  issues: readonly LayoutIssue[];
}): React.ReactNode {
  return (
    <aside
      data-testid="perf-hud"
      className="pointer-events-none absolute right-3 top-3 rounded border border-zinc-700 bg-zinc-950/95 px-2.5 py-1.5 font-mono text-xs text-zinc-400"
    >
      <div>layout {props.layoutMs.toFixed(1)} ms</div>
      <div>
        {props.nodes} nodes · {props.edges} routes
      </div>
      {props.issues.map((issue) => (
        <div key={`${issue.category}:${issue.message}`} className="text-amber-300">
          {issue.level}: {issue.message}
        </div>
      ))}
    </aside>
  );
}
