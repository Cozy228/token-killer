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
}

export function ClaimLegend({ counts, active, onToggle }: ClaimLegendProps): React.ReactElement {
  return (
    <aside className="legend" aria-label="Claim status legend and filter">
      <h3>Claim status</h3>
      {STATUS_ORDER.map((status) => (
        <button
          key={status}
          type="button"
          className="row"
          data-status={status}
          aria-pressed={active.has(status)}
          aria-label={`${status}, ${counts[status] ?? 0} — click to filter`}
          onClick={() => onToggle(status)}
        >
          <span className="swatch" aria-hidden="true" />
          <span>{status}</span>
          <span className="count mono">{counts[status] ?? 0}</span>
        </button>
      ))}
    </aside>
  );
}
