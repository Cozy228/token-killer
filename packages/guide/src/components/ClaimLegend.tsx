/**
 * Claim Legend dock (design §1 signature component) — always-visible map legend
 * that teaches the glyph grammar, shows live counts per status, and doubles as a
 * filter: clicking a status toggles it. One legend, shared across all three
 * surfaces. Status vocabulary is EXACTLY LAW §3's six words (never synonyms).
 */
import type { ClaimStatus } from "@contexa/core";

export const STATUS_ORDER: ClaimStatus[] = [
  "resolved",
  "conflicting",
  "stale",
  "unavailable",
  "restricted",
  "unknown",
];

export interface ClaimLegendProps {
  counts: Record<string, number>;
  active: Set<ClaimStatus>;
  onToggle: (status: ClaimStatus) => void;
  /** What the numbers count — rendered as the caption + aria/title so the
   *  semantic is explicit on a trust instrument. Default: the current surface. */
  scope?: string;
}

export function ClaimLegend({
  counts,
  active,
  onToggle,
  scope = "entities on this surface",
}: ClaimLegendProps): React.ReactElement {
  return (
    <aside className="legend" aria-label={`Claim status legend and filter — counts of ${scope}`}>
      <h3 title={`Counts of ${scope}, by claim status`}>Claim status</h3>
      {STATUS_ORDER.map((status) => {
        const n = counts[status] ?? 0;
        return (
          <button
            key={status}
            type="button"
            className="row"
            data-status={status}
            aria-pressed={active.has(status)}
            aria-label={`${status}: ${n} ${scope} — click to filter`}
            title={`${n} ${scope} with status ${status}`}
            onClick={() => onToggle(status)}
          >
            <span className="swatch" aria-hidden="true" />
            <span>{status}</span>
            <span className="count mono">{n}</span>
          </button>
        );
      })}
      <p className="legend-cap">counts: {scope}</p>
    </aside>
  );
}
