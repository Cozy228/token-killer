/**
 * Envelope glyph chip (design §3) — the web twin of `renderEnvelopeTerse`,
 * extending its grammar, never forking it. Five axes on five channels:
 *   derivation = mark SHAPE · status = mark HUE · confidence = tick stack ·
 *   freshness = mark OPACITY · disclosure(restricted) = trailing lock.
 * Hover/focus opens a popover whose first line is the EXACT terse string
 * (verbatim, from core). Honest-gap (G-honest-gap): a null axis renders `?` and
 * the word "unknown" as a disclosed gap, never omitted, never guessed.
 */
import { useId } from "react";
import type { EvidencePacket } from "@contexa/core";

export interface EnvelopeChipProps {
  evidence: EvidencePacket;
  onOpenEvidence?: (e: EvidencePacket) => void;
}

const DERIV_SHAPE: Record<string, string> = {
  OBSERVED: "mark-observed",
  DECLARED: "mark-declared",
  INFERRED: "mark-inferred",
};

function freshnessOpacity(freshness: string): { opacity: number; hatch?: boolean } {
  if (freshness === "unknown-until-reverified") return { opacity: 0.55, hatch: true };
  if (freshness === "content-hash") return { opacity: 1 };
  return { opacity: 0.78 };
}

function confidenceTicks(confidence: string | null): number {
  switch (confidence) {
    case "CONFIRMED":
      return 3;
    case "LIKELY":
      return 2;
    case "POSSIBLE":
      return 1;
    default:
      return 0;
  }
}

export function EnvelopeChip({ evidence, onOpenEvidence }: EnvelopeChipProps): React.ReactElement {
  const { envelope: env, glyphs, terse, preRSlice } = evidence;
  const popId = useId();
  const shapeClass = env.derivation ? DERIV_SHAPE[env.derivation] : "mark-null";
  const { opacity, hatch } = freshnessOpacity(env.freshness);
  const ticks = confidenceTicks(env.confidence);
  const rev = env.evidence.revision ? `@${env.evidence.revision.slice(0, 8)}` : "";

  const aria =
    `claim: derivation ${glyphs.derivation.label}, confidence ${glyphs.confidence.label}, ` +
    `status ${glyphs.status.label}, freshness ${env.freshness}, disclosure ${env.disclosure}`;

  return (
    <span
      className="chip"
      data-status={env.status}
      tabIndex={0}
      role="button"
      aria-label={aria}
      aria-describedby={popId}
    >
      <span
        className={`mark ${shapeClass} ${hatch ? "mark-hatch" : ""}`}
        style={{ opacity }}
        aria-hidden="true"
      />
      <span className="ticks" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`tick ${i < ticks ? "on" : ""}`}
            style={{ height: `${4 + i * 3}px` }}
          />
        ))}
        {env.confidence === null && <span className="gap-q">?</span>}
      </span>
      {env.disclosure === "restricted" && (
        <span className="lock" aria-hidden="true">
          &#128274;
        </span>
      )}
      {rev && <span className="rev mono">{rev}</span>}

      <span className="pop" id={popId} role="tooltip">
        <div className="terse">{terse}</div>
        <dl>
          <dt>derivation</dt>
          <dd className={glyphs.derivation.gap ? "gap" : ""}>
            {env.derivation ?? "unknown"}
            {preRSlice.includes("derivation") && <span className="compat">compat shadow</span>}
          </dd>
          <dt>confidence</dt>
          <dd className={glyphs.confidence.gap ? "gap" : ""}>
            {env.confidence ?? "unknown"}
            {preRSlice.includes("confidence") && <span className="compat">compat shadow</span>}
          </dd>
          <dt>status</dt>
          <dd>{env.status}</dd>
          <dt>freshness</dt>
          <dd>{env.freshness}</dd>
          <dt>disclosure</dt>
          <dd>{env.disclosure}</dd>
          <dt>observed_at</dt>
          <dd>{new Date(env.observedAt).toISOString()}</dd>
        </dl>
        {onOpenEvidence && (
          <button type="button" className="evidence" onClick={() => onOpenEvidence(evidence)}>
            Open evidence
          </button>
        )}
      </span>
    </span>
  );
}
