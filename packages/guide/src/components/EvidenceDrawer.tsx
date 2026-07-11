/**
 * Evidence Drawer (design §4) — ONE drawer pattern reused everywhere. Shows the
 * anchor URI / revision / hash in mono (evidence material), the exact terse
 * render, and the copyable `ctx` command where curation applies. Read-only:
 * commands are copyable text, never buttons that execute (R1).
 */
import type { EvidencePacket } from "@contexa/core";

export interface EvidenceDrawerProps {
  evidence: EvidencePacket | null;
  onClose: () => void;
}

export function EvidenceDrawer({ evidence, onClose }: EvidenceDrawerProps): React.ReactElement | null {
  if (!evidence) return null;
  const { envelope: env, terse, preRSlice } = evidence;
  return (
    <div className="drawer" role="dialog" aria-label="Evidence">
      <button type="button" className="close" onClick={onClose} aria-label="Close evidence">
        Close
      </button>
      <h2>Evidence</h2>
      <p className="terse mono">{terse}</p>
      <dl>
        <dt>anchor</dt>
        <dd className="anchor">{env.evidence.uri}</dd>
        {env.evidence.revision && (
          <>
            <dt>revision</dt>
            <dd className="anchor">{env.evidence.revision}</dd>
          </>
        )}
        {env.evidence.hash && (
          <>
            <dt>hash</dt>
            <dd className="anchor">{env.evidence.hash}</dd>
          </>
        )}
        <dt>status</dt>
        <dd>{env.status}</dd>
        <dt>observed_at</dt>
        <dd className="anchor">{new Date(env.observedAt).toISOString()}</dd>
      </dl>
      {preRSlice.length > 0 && (
        <p className="empty">
          Pre-R-slice gaps (disclosed, not fabricated): {preRSlice.join(", ")}
        </p>
      )}
    </div>
  );
}
