/**
 * Subject (understanding, brief §3.2) — biography-of-anything. Sticky header with
 * the subject's envelope chip, then facts (prose + chip + anchor), the decision
 * chain (a real sequence, ordered markers earned), history/co-change table, and a
 * bounded neighborhood mini-graph. Provenance-or-it-does-not-render: every fact
 * carries its chip; the chip's "Open evidence" opens the shared drawer.
 */
import type { EvidencePacket, SubjectProjection } from "@contexa/core";
import { getSubject } from "../api.ts";
import { useAsync } from "../util.ts";
import { EnvelopeChip } from "../components/EnvelopeChip.tsx";

export interface SubjectProps {
  refId: string;
  onOpenSubject: (ref: string) => void;
  onOpenEvidence: (e: EvidencePacket) => void;
}

export function Subject({ refId, onOpenSubject, onOpenEvidence }: SubjectProps): React.ReactElement {
  const { data, loading, error } = useAsync<SubjectProjection | undefined>(
    () => getSubject(refId),
    [refId],
  );

  if (loading) return <div className="pad empty">Loading subject…</div>;
  if (error) return <div className="pad empty">Could not load subject: {error.message}</div>;
  if (!data) return <div className="pad empty">Subject not found: {refId}</div>;

  const codey = data.subject.kind === "symbol" || data.subject.kind === "file";
  return (
    <div className="pad">
      <header style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <span className="kicon" aria-hidden="true">
          ◈
        </span>
        <h1 className={codey ? "mono" : ""}>{data.subject.name}</h1>
        <EnvelopeChip evidence={data.evidence} onOpenEvidence={onOpenEvidence} />
        <button type="button" className="tab" onClick={() => onOpenEvidence(data.evidence)}>
          Open evidence
        </button>
      </header>

      <section className="prose">
        <h2>Facts</h2>
        {data.facts.length === 0 && <p className="empty">No facts recorded for this subject.</p>}
        {data.facts.map((f, i) => (
          <div key={i} className="factrow">
            <span className="label">{f.label}</span>
            <span className="val">
              {f.entityId ? (
                <button type="button" className="tab" onClick={() => onOpenSubject(f.entityId!)}>
                  {f.value}
                </button>
              ) : (
                f.value
              )}
            </span>
            <EnvelopeChip evidence={f.evidence} onOpenEvidence={onOpenEvidence} />
          </div>
        ))}
      </section>

      {data.decisionChain.length > 0 && (
        <section className="prose" style={{ marginTop: 16 }}>
          <h2>Decision chain</h2>
          <ol>
            {data.decisionChain.map((d, i) => (
              <li key={i}>
                <span className="mono">{d.verb}</span>
                {d.reason ? `: ${d.reason}` : ""}{" "}
                <span className="mono" style={{ color: "var(--ink-dim)" }}>
                  {new Date(d.at).toISOString().slice(0, 10)}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {data.history.length > 0 && (
        <section style={{ marginTop: 16 }}>
          <h2>History and co-change</h2>
          <table className="data">
            <thead>
              <tr>
                <th>entity</th>
                <th>relation</th>
                <th>confidence</th>
              </tr>
            </thead>
            <tbody>
              {data.history.map((h, i) => (
                <tr key={i}>
                  <td>
                    <button type="button" className="tab" onClick={() => onOpenSubject(h.entityId)}>
                      {h.name}
                    </button>
                  </td>
                  <td className="mono">{h.predicate}</td>
                  <td className="num">{h.confidence.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section style={{ marginTop: 16 }}>
        <h2>Neighborhood</h2>
        <p className="empty">
          {data.neighborhood.nodes.length} node(s), {data.neighborhood.edges.length} edge(s)
          (budget depth {data.budget.budget.depth}, cap {data.budget.budget.nodeCap})
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {data.neighborhood.nodes
            .filter((n) => n.depth > 0)
            .map((n) => (
              <button key={n.entityId} type="button" className="cli" onClick={() => onOpenSubject(n.entityId)}>
                {n.name}
              </button>
            ))}
        </div>
      </section>
    </div>
  );
}
