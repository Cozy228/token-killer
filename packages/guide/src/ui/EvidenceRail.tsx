// Evidence Rail (D23): a narrow, event-scoped, ORDERED rail beside the Atlas.
// Mechanical traversal order only — anchors -> contains -> calls -> imports,
// hop ascending, path ascending. Each step click-focuses the canvas and carries
// its edge type + provenance. NEVER contains summaries, ranking, or prose.

import type { RailGroup, RailStep } from "../atlas/types.js";
import type { VariantSpec } from "../variants/types.js";

const GROUP_LABEL: Record<RailGroup, string> = {
  anchors: "Anchors",
  contains: "Containing modules (contains)",
  calls: "Direct calls",
  imports: "Direct imports",
};

const GROUP_ORDER: RailGroup[] = ["anchors", "contains", "calls", "imports"];

export function EvidenceRail(props: {
  rail: RailStep[];
  focusedId: string | null;
  onFocus: (nodeId: string) => void;
  variant: VariantSpec;
  eventLabel: string;
}) {
  const { rail, focusedId, onFocus, variant, eventLabel } = props;
  const Custom = variant.RailStep;

  const byGroup = new Map<RailGroup, RailStep[]>();
  for (const g of GROUP_ORDER) byGroup.set(g, []);
  for (const step of rail) byGroup.get(step.group)?.push(step);

  return (
    <aside className="evidence-rail" aria-label="Evidence Rail">
      <header className="rail-header">
        <div className="rail-title">Change Trace</div>
        <div className="rail-subtitle">{eventLabel}</div>
        <div className="rail-note">Mechanical order: hop distance from anchors. No ranking.</div>
      </header>
      {GROUP_ORDER.map((group) => {
        const steps = byGroup.get(group) ?? [];
        if (steps.length === 0) return null;
        return (
          <section className="rail-group" key={group}>
            <h3 className="rail-group-title">{GROUP_LABEL[group]}</h3>
            <ol className="rail-steps">
              {steps.map((step) =>
                Custom ? (
                  <li key={`${step.group}:${step.nodeId}`}>
                    <Custom step={step} focused={step.nodeId === focusedId} onFocus={onFocus} />
                  </li>
                ) : (
                  <li key={`${step.group}:${step.nodeId}`}>
                    <button
                      type="button"
                      className={`rail-step${step.nodeId === focusedId ? " rail-step-focused" : ""}`}
                      onClick={() => onFocus(step.nodeId)}
                      title={step.path}
                    >
                      <span className="rail-step-label">{step.label}</span>
                      <span className="rail-step-meta">
                        hop {step.hop} · {step.edgeKind}
                      </span>
                      <span className="rail-step-prov">{step.provenance}</span>
                    </button>
                  </li>
                ),
              )}
            </ol>
          </section>
        );
      })}
      {rail.length === 0 ? <div className="rail-empty">No observed evidence steps for this event.</div> : null}
    </aside>
  );
}
