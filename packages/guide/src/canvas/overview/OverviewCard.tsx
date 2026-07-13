/**
 * A D29 Overview card: ONE module/package scope.
 *
 * Deterministic content ONLY — name, path, file/declaration counts, changed/needs-review/
 * conflict counts, aggregate in/out counts, trust + freshness. Not one word of it is
 * generated: every number is a store fact the kernel handed over, and the role line that M4
 * will eventually write is not here, not stubbed, and not hinted at.
 *
 * THE CARD IS ITS OWN RULER (D37/D39). This component is rendered TWICE from the same code:
 * once, invisibly, by `measure.ts` to obtain its real box, and once on the canvas pinned to
 * exactly that box. So the size ELK lays out is the size the user sees, by construction —
 * the reference's "feed ELK 280x120, render something else" defect is not reachable from
 * here.
 *
 * Every font size on this card is at or above `--canvas-min-font` (14px). That is not taste:
 * the canvas is zoomable and the readability floor is measured in SCREEN px (font x zoom), so
 * the smallest font on the canvas and the canvas's own `minZoom` are two ends of one
 * arithmetic (`readability.ts`).
 */
import type { AttentionCounts, ProjectedContainer } from "../../data/dto.ts";

/** The trust the card may claim — never stronger than its weakest constituent (§3). */
export interface CardTrust {
  /** Weakest confidence tier across the scope's incident aggregate edges. */
  weakest: string | null;
  freshness: "fresh" | "stale";
  /** Total constituent claims behind the scope's incident relations. */
  claims: number;
  /** True when no relation claim touches this scope at all — an honest absence. */
  none: boolean;
}

export interface OverviewCardProps {
  container: ProjectedContainer;
  attention: AttentionCounts;
  trust: CardTrust;
  selected?: boolean;
  /** D40: no `calls`/`imports` route in this projection — the honest periphery. */
  noVisibleRoute?: boolean;
}

export function OverviewCard(props: OverviewCardProps): React.ReactNode {
  const { container, attention, trust } = props;
  const files = container.fileCount ?? 0;
  const attentionTotal = attention.changed + attention.needsReview + attention.conflict;

  return (
    <article
      data-node-kind="scope-card"
      data-node-id={container.id}
      data-selected={props.selected ? "true" : "false"}
      className={[
        "ctx-card flex w-fit flex-col gap-0.5 rounded-lg border px-3 py-2",
        "bg-zinc-900 text-zinc-200",
        props.selected ? "border-sky-400 ring-2 ring-sky-400/40" : "border-zinc-700",
      ].join(" ")}
    >
      <header className="flex items-baseline gap-2">
        {/* E1: there is no path through this component that renders a card without a name. */}
        <h3 data-role="name" className="ctx-card-name whitespace-nowrap font-mono font-semibold">
          {container.name}
        </h3>
        {props.noVisibleRoute ? (
          <span data-role="periphery" className="ctx-card-meta whitespace-nowrap text-zinc-500">
            no visible route
          </span>
        ) : null}
      </header>

      <p data-role="counts" className="ctx-card-meta whitespace-nowrap text-zinc-400">
        {plural(files, "file")} · {plural(container.declarationCount, "declaration")}
      </p>

      {/* Direction is spatial (D34) — these two numbers say how MUCH, the layout says which
          way. The arrows name the direction so a static screenshot is unambiguous. */}
      <p data-role="degree" className="ctx-card-meta whitespace-nowrap font-mono text-zinc-300">
        <span title="scopes that depend on this one">&uarr; {container.degree.inbound} in</span>
        <span className="px-1.5 text-zinc-600">|</span>
        <span title="scopes this one depends on">&darr; {container.degree.outbound} out</span>
      </p>

      <p data-role="attention" className="ctx-card-meta whitespace-nowrap text-zinc-400">
        {attentionTotal === 0 ? (
          <span className="text-zinc-500">nothing needing attention</span>
        ) : (
          <>
            <Chip n={attention.changed} label="changed" tone="text-amber-300" />
            <Chip n={attention.needsReview} label="needs review" tone="text-sky-300" />
            <Chip n={attention.conflict} label="conflict" tone="text-rose-300" />
          </>
        )}
      </p>

      <p
        data-role="trust"
        className="ctx-card-meta whitespace-nowrap text-zinc-500"
        title={
          trust.none
            ? "no calls or imports claim names this scope"
            : `${trust.claims} constituent claims; the aggregate is never stronger than its weakest`
        }
      >
        {trust.none ? (
          "no relation claims"
        ) : (
          <>
            <span className="text-zinc-300">{trust.weakest ?? "unknown"}</span>
            <span className="px-1 text-zinc-600">·</span>
            <span className={trust.freshness === "fresh" ? "text-emerald-400" : "text-amber-300"}>
              {trust.freshness}
            </span>
            <span className="px-1 text-zinc-600">·</span>
            {plural(trust.claims, "claim")}
          </>
        )}
      </p>
    </article>
  );
}

function Chip(props: { n: number; label: string; tone: string }): React.ReactNode {
  if (props.n === 0) return null;
  return (
    <span className={`${props.tone} pr-2`}>
      {props.n} {props.label}
    </span>
  );
}

/** Exact counts, always. No "many", no "several", no rounding. */
function plural(n: number, noun: string): string {
  return `${n.toLocaleString("en-US")} ${noun}${n === 1 ? "" : "s"}`;
}
