/**
 * The D28 top bar — STUB. repo · revision · generation · live|snapshot|stale badge.
 * Nothing else: the omnibox, the mode switch and the rest of the shell land in slice S.
 */
import type { FreshnessState, GuideStatus } from "../data/dto.ts";

const BADGE_STYLE: Readonly<Record<FreshnessState, string>> = {
  live: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/40",
  snapshot: "bg-sky-500/15 text-sky-300 ring-sky-500/40",
  stale: "bg-amber-500/15 text-amber-300 ring-amber-500/40",
  empty: "bg-zinc-500/15 text-zinc-300 ring-zinc-500/40",
};

/** Short form of an identity digest — the full value stays in the title attribute. */
function short(value: string): string {
  return value === "" ? "—" : value.slice(0, 12);
}

export function TopBar(props: { status: GuideStatus | undefined }): React.ReactNode {
  const status = props.status;
  const state: FreshnessState | undefined = status?.generation.state;

  return (
    <header className="flex items-center gap-4 border-b border-zinc-800 bg-zinc-950 px-4 py-2 text-sm text-zinc-300">
      <span className="font-semibold text-zinc-100">ctx guide</span>

      <span className="text-zinc-500">·</span>
      <span title={status?.repo.root ?? ""}>{status?.repo.name ?? "—"}</span>

      <span className="text-zinc-500">·</span>
      <span className="font-mono text-xs" title={`revision ${status?.generation.repoRev ?? ""}`}>
        rev {short(status?.generation.repoRev ?? "")}
      </span>

      <span className="text-zinc-500">·</span>
      <span
        className="font-mono text-xs"
        title={`generation identity ${status?.generation.currentIdentity ?? ""}`}
      >
        gen {short(status?.generation.currentIdentity ?? "")}
      </span>

      <span className="ml-auto">
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
    </header>
  );
}
