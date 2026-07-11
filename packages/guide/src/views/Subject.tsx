/**
 * Subject (P40 R15 J3) — a biography for EVERY entity kind (symbol, file,
 * doc_section, commit, decision, memory, concept). Header carries the subject's
 * own claim envelope; facts resolve to evidence anchors through the drawer
 * (G-provenance); a subject-scoped decision chain + history; and a bounded local
 * neighborhood rendered within its declared budget (R14). Deep-linkable
 * (#/subject/<id>) so a pasted link opens straight here (S10). No dead ends: an
 * unresolved ref offers search rather than a blank.
 */
import { useEffect } from "react";
import type { SubjectProjection } from "@contexa/core";
import { getSubject } from "../api.ts";
import { useAsync, statusCounts } from "../util.ts";
import { isDimmed, useApp } from "../appContext.ts";
import { navigate } from "../router.ts";
import { EnvelopeChip } from "../components/EnvelopeChip.tsx";
import { Neighborhood } from "../components/Neighborhood.tsx";

function fmtDate(at: number): string {
  if (!at) return "—";
  return new Date(at).toISOString().slice(0, 10);
}

export function Subject({ refId }: { refId: string }): React.ReactElement {
  const { openEvidence, focus, setScope } = useApp();
  const state = useAsync<SubjectProjection | undefined>(() => getSubject(refId), [refId]);
  const s = state.data;

  useEffect(() => {
    if (s) setScope(statusCounts(s), "facts about this subject");
  }, [s, setScope]);

  if (state.loading) return <div className="loading">Loading subject…</div>;
  if (state.error) return <div className="err">Failed: {state.error.message}</div>;
  if (!s) {
    return (
      <div className="wrap">
        <div className="empty-state">
          <h1>Subject not found</h1>
          <p className="muted">
            <span className="mono">{refId}</span> did not resolve to an entity on this checkout.
          </p>
          <button type="button" className="kbd-btn" onClick={() => navigate({ view: "orient" })}>
            Back to orient
          </button>
        </div>
      </div>
    );
  }

  const omittedNote =
    s.budget.omitted > 0
      ? `neighborhood bounded: depth ${s.budget.budget.depth}, cap ${s.budget.budget.nodeCap} — ${s.budget.omitted} omitted`
      : `neighborhood: depth ${s.budget.budget.depth}, ≤${s.budget.budget.nodeCap} nodes`;

  return (
    <div className="wrap">
      <div className="subject-head">
        <span className="kindbig">{s.subject.kind}</span>
        <div style={{ minWidth: 0 }}>
          <h1>{s.subject.name}</h1>
          <div className="anchor-uri">{s.evidence.envelope.evidence.uri}</div>
        </div>
        <div style={{ marginLeft: "auto", marginTop: 4 }}>
          <EnvelopeChip evidence={s.evidence} onOpenEvidence={openEvidence} />
        </div>
      </div>

      <div className="grid cols-2" style={{ marginTop: 16 }}>
        <section className="panel">
          <header>
            <h2>Facts</h2>
            <span className="sub">relationships & attributes · click a chip for evidence</span>
          </header>
          <div className="body">
            {s.facts.length === 0 ? (
              <p className="muted">No outgoing facts recorded.</p>
            ) : (
              s.facts.map((f, i) => (
                <div
                  className="fact"
                  key={i}
                  style={{ opacity: isDimmed(focus, f.evidence.envelope.status) ? 0.4 : 1 }}
                >
                  <span className="label">{f.label}</span>
                  {f.entityId ? (
                    <button
                      type="button"
                      className="val"
                      onClick={() => navigate({ view: "subject", ref: f.entityId! })}
                    >
                      {f.value}
                    </button>
                  ) : (
                    <span className="val">{f.value}</span>
                  )}
                  <EnvelopeChip evidence={f.evidence} onOpenEvidence={openEvidence} />
                </div>
              ))
            )}
          </div>
        </section>

        <section className="panel">
          <header>
            <h2>Local neighborhood</h2>
            <span className="sub">bounded ego-graph · click to re-center</span>
          </header>
          <div className="body">
            <Neighborhood
              subjectId={s.subject.entityId}
              centerStatus={s.evidence.envelope.status}
              nodes={s.neighborhood.nodes}
              edges={s.neighborhood.edges}
              omittedNote={omittedNote}
            />
          </div>
        </section>
      </div>

      {s.decisionChain.length > 0 && (
        <section className="panel" style={{ marginTop: 16 }}>
          <header>
            <h2>Decision & lifecycle chain</h2>
            <span className="sub">time-ordered</span>
          </header>
          <div className="body">
            <div className="chain">
              {s.decisionChain.map((e, i) => (
                <div className="ev" key={i}>
                  <div>
                    <div className="verb">{e.verb}</div>
                    <div className="when">{fmtDate(e.at)}</div>
                  </div>
                  <div>
                    <div>{e.name}</div>
                    {e.reason && <div className="reason">{e.reason}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {s.history.length > 0 && (
        <section className="panel" style={{ marginTop: 16 }}>
          <header>
            <h2>History & co-change</h2>
            <span className="sub">what touched or co-changed with this subject</span>
          </header>
          <div className="body">
            <div className="rows">
              {s.history.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  className="erow"
                  onClick={() => navigate({ view: "subject", ref: h.entityId })}
                >
                  <span className="kind">{h.predicate}</span>
                  <span className="ename">{h.name}</span>
                  <span className="heat">×{h.confidence.toFixed(2)}</span>
                </button>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
