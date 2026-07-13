// Generation switch prompt (D10). When a new generation appears WHILE READING,
// the current generation stays pinned and this dismissible prompt offers a
// switch. The map is never refreshed underneath the reader — nothing changes
// until "Switch" is pressed.
//
// Copy passes the D24 naming gate (no impact/affected/risk/breaks wording).

import type { GenerationInfo } from "../atlas/types.js";

export interface GenerationPromptProps {
  /** The generation currently pinned on screen. */
  current: GenerationInfo;
  /** The newly detected generation. */
  pending: GenerationInfo;
  onSwitch: () => void;
  onDismiss: () => void;
}

function diffLine(current: GenerationInfo, pending: GenerationInfo): string {
  const df = pending.fileCount - current.fileCount;
  const dd = pending.declCount - current.declCount;
  const sign = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  // Counts are cheaply derivable from both payloads, so show the diff (D10).
  return `${sign(df)} files · ${sign(dd)} declarations`;
}

export function GenerationPrompt({ current, pending, onSwitch, onDismiss }: GenerationPromptProps) {
  return (
    <div className="gen-prompt" role="status" aria-live="polite">
      <div className="gen-prompt-body">
        <strong className="gen-prompt-title">
          New generation {pending.generations.code} available
        </strong>
        <span className="gen-prompt-diff">{diffLine(current, pending)}</span>
      </div>
      <div className="gen-prompt-actions">
        <button type="button" className="gen-prompt-switch" onClick={onSwitch}>
          Switch
        </button>
        <button type="button" className="gen-prompt-dismiss" onClick={onDismiss} aria-label="dismiss">
          Dismiss
        </button>
      </div>
    </div>
  );
}
