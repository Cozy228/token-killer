/**
 * The D28 top bar. EXACTLY: repo · revision · generation · live|snapshot|stale · omnibox ·
 * current mode. Nothing else — D28 says "nothing else", and that is a budget, not a mood.
 *
 * The omnibox INPUT lives here (it is chrome, and chrome is persistent). Its RESULT SURFACE
 * is slice F: the input therefore accepts text and says where the answer will come from,
 * rather than pretending to search and returning nothing. A search box that silently does
 * nothing is the "dead search" the v2 drive was killed for.
 */
import type { FreshnessState, GuideStatus } from "../data/dto.ts";
import { useView, type CanvasMode } from "../state/view.ts";

const BADGE_STYLE: Readonly<Record<FreshnessState, string>> = {
  live: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40",
  snapshot: "bg-sky-500/15 text-sky-300 ring-sky-500/40",
  stale: "bg-amber-500/15 text-amber-300 ring-amber-500/40",
  empty: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/40",
};

const MODE_LABEL: Readonly<Record<CanvasMode, string>> = {
  overview: "Overview",
  scope: "Scope Graph",
  connections: "Connections",
  event: "Change Trace",
};

/** Short form of an identity digest — the full value stays in the title attribute. */
function short(value: string): string {
  return value === "" ? "—" : value.slice(0, 12);
}

export function TopBar(props: {
  status: GuideStatus | undefined;
  /** Narrow viewport: the rail and the inspector became drawers and need triggers. */
  narrow?: boolean;
}): React.ReactNode {
  const status = props.status;
  const state: FreshnessState | undefined = status?.generation.state;
  const mode = useView((s) => s.mode);
  const railOpen = useView((s) => s.railOpen);
  const inspectorOpen = useView((s) => s.inspectorOpen);
  const setRailOpen = useView((s) => s.setRailOpen);
  const setInspectorOpen = useView((s) => s.setInspectorOpen);

  return (
    <header
      data-testid="topbar"
      className="flex h-12 shrink-0 items-center gap-3 border-b border-zinc-800 bg-zinc-950 px-3 text-sm text-zinc-300"
    >
      {props.narrow ? (
        <button
          type="button"
          data-testid="rail-toggle"
          aria-expanded={railOpen}
          onClick={() => setRailOpen(!railOpen)}
          className="shrink-0 rounded px-2 py-1 text-xs text-zinc-300 ring-1 ring-zinc-700 hover:bg-zinc-900"
        >
          Tree
        </button>
      ) : null}

      <span className="shrink-0 font-semibold text-zinc-100">ctx guide</span>

      <span className="shrink-0 text-zinc-500">·</span>
      <span className="shrink-0 truncate" title={status?.repo.root ?? ""}>
        {status?.repo.name ?? "—"}
      </span>

      <span className="shrink-0 text-zinc-500">·</span>
      <span
        className="shrink-0 font-mono text-xs"
        title={`revision ${status?.generation.repoRev ?? ""}`}
      >
        rev {short(status?.generation.repoRev ?? "")}
      </span>

      <span className="shrink-0 text-zinc-500">·</span>
      <span
        className="shrink-0 font-mono text-xs"
        title={`generation identity ${status?.generation.currentIdentity ?? ""}`}
      >
        gen {short(status?.generation.currentIdentity ?? "")}
      </span>

      <span className="shrink-0">
        {state === undefined ? (
          <span className="rounded px-2 py-0.5 text-xs text-zinc-500 ring-1 ring-zinc-700">
            checking…
          </span>
        ) : (
          <span
            data-testid="freshness-badge"
            title={status?.generation.reason}
            className={`rounded px-2 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 ${BADGE_STYLE[state]}`}
          >
            {state}
          </span>
        )}
      </span>

      <Omnibox />

      <span
        data-testid="topbar-mode"
        className="shrink-0 rounded bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300 ring-1 ring-zinc-700"
      >
        {MODE_LABEL[mode]}
      </span>

      {props.narrow ? (
        <button
          type="button"
          data-testid="inspector-toggle"
          aria-expanded={inspectorOpen}
          onClick={() => setInspectorOpen(!inspectorOpen)}
          className="shrink-0 rounded px-2 py-1 text-xs text-zinc-300 ring-1 ring-zinc-700 hover:bg-zinc-900"
        >
          Inspect
        </button>
      ) : null}
    </header>
  );
}

/**
 * The input, not the results. It is honest about where its answers will come from — the
 * store's FTS index over the seven entity kinds, wired in slice F. Until then it states that
 * plainly instead of returning an empty list, which would read as "nothing matched".
 */
function Omnibox(): React.ReactNode {
  return (
    <div className="mx-auto flex min-w-0 max-w-md flex-1 items-center">
      <input
        data-testid="omnibox"
        type="search"
        placeholder="Search — results land in a later slice"
        aria-label="Search the context store"
        title="The omnibox searches the store's full-text index over all seven entity kinds. Its result surface is not built yet."
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none"
      />
    </div>
  );
}
