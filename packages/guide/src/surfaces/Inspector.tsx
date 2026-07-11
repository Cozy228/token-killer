/**
 * Inspector (inspection, brief §3.3) — one tabbed worklist: review queue /
 * conflicts / push preview / memory / health. Every actionable row renders its
 * EXACT `ctx` command as copyable mono text (click = copy); commands are never
 * buttons that execute (R1). Push preview shows the verbatim would-be digest with
 * used/budget figures. Status vocabulary is exactly LAW §3's six words.
 */
import { useState } from "react";
import type { EvidencePacket, InspectorProjection } from "@contexa/core";
import { getInspector } from "../api.ts";
import { useAsync } from "../util.ts";
import { EnvelopeChip } from "../components/EnvelopeChip.tsx";

const TABS = ["review", "conflicts", "push", "memory", "health"] as const;
type Tab = (typeof TABS)[number];

function CopyCommand({ cmd }: { cmd: string }): React.ReactElement {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    try {
      void navigator.clipboard?.writeText(cmd);
    } catch {
      /* clipboard unavailable */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button type="button" className="cli" onClick={copy} title="Copy command" aria-label={`Copy command: ${cmd}`}>
      {copied ? "Copied" : cmd}
    </button>
  );
}

export interface InspectorProps {
  onOpenEvidence: (e: EvidencePacket) => void;
}

export function Inspector({ onOpenEvidence }: InspectorProps): React.ReactElement {
  const { data, loading, error } = useAsync<InspectorProjection>(getInspector, []);
  const [tab, setTab] = useState<Tab>("review");

  if (loading) return <div className="pad empty">Loading inspector…</div>;
  if (error) return <div className="pad empty">Could not load inspector: {error.message}</div>;
  if (!data) return <div className="pad empty">No data.</div>;

  return (
    <div className="pad">
      <div style={{ display: "flex", gap: 4, marginBottom: 12 }} role="tablist">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            className="tab"
            aria-current={tab === t ? "page" : undefined}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "review" && (
        <section>
          {data.reviewQueue.length === 0 ? (
            <p className="empty">Review queue is clear.</p>
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>note</th>
                  <th>claim</th>
                  <th>command</th>
                </tr>
              </thead>
              <tbody>
                {data.reviewQueue.map((r) => (
                  <tr key={r.entityId}>
                    <td className="prose">{r.gist}</td>
                    <td>
                      <EnvelopeChip evidence={r.evidence} onOpenEvidence={onOpenEvidence} />
                    </td>
                    <td>
                      <CopyCommand cmd={r.cliCommand} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === "conflicts" && (
        <section>
          {data.conflicts.length === 0 ? (
            <p className="empty">No open conflicts.</p>
          ) : (
            data.conflicts.map((g) => (
              <div key={g.reasonClass} style={{ marginBottom: 12 }}>
                <h2 className="mono">{g.reasonClass}</h2>
                <table className="data">
                  <tbody>
                    {g.items.map((it, i) => (
                      <tr key={i}>
                        <td className="mono">{it.subjectA}</td>
                        <td className="mono">{it.subjectB}</td>
                        <td>
                          <CopyCommand cmd={it.cliCommand} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </section>
      )}

      {tab === "push" && (
        <section>
          <p className="mono">
            {data.pushPreview.bytes}/{data.pushPreview.budgetBytes} bytes ·{" "}
            {data.pushPreview.omittedGotchas} note(s) omitted
          </p>
          <pre
            className="panel mono"
            style={{ whiteSpace: "pre-wrap", overflowX: "auto" }}
            aria-label="Verbatim would-be push digest"
          >
            {data.pushPreview.digestText || "(empty digest)"}
          </pre>
          {data.pushPreview.pins.length > 0 && (
            <p className="mono">pins: {data.pushPreview.pins.join(", ")}</p>
          )}
          {data.pushPreview.vetoes.length > 0 && (
            <p className="mono">vetoes: {data.pushPreview.vetoes.join(", ")}</p>
          )}
        </section>
      )}

      {tab === "memory" && (
        <section>
          <p className="mono">
            mainline {data.memoryBrowser.zones.mainline} · overlay {data.memoryBrowser.zones.overlay}{" "}
            · unknown {data.memoryBrowser.zones.unknown}
          </p>
          <table className="data">
            <thead>
              <tr>
                <th>note</th>
                <th>zone</th>
                <th>origin</th>
                <th>status</th>
                <th>lifecycle</th>
              </tr>
            </thead>
            <tbody>
              {data.memoryBrowser.entries.map((m) => (
                <tr key={m.entityId}>
                  <td className="prose">{m.gist}</td>
                  <td className="mono">{m.zone}</td>
                  <td className="mono">{m.origin}</td>
                  <td className="mono">{m.status}</td>
                  <td className="mono">{m.lifecycle.map((l) => l.verb).join(" → ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "health" && (
        <section>
          <table className="data">
            <thead>
              <tr>
                <th>source</th>
                <th>gen</th>
                <th>cursor</th>
                <th>freshness</th>
                <th>signal</th>
              </tr>
            </thead>
            <tbody>
              {data.health.sources.map((s) => (
                <tr key={s.source}>
                  <td className="mono">{s.source}</td>
                  <td className="num">{s.publishedGen}</td>
                  <td className="mono">{s.cursorPosition ?? "—"}</td>
                  <td className="num">
                    {s.cursorFreshness ? new Date(s.cursorFreshness).toISOString().slice(0, 10) : "—"}
                  </td>
                  <td className="mono">{s.stale ? "stale" : "ok"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mono" style={{ marginTop: 8 }}>
            needs-review {data.health.needsReview} · open conflicts {data.health.openConflicts}
          </p>
        </section>
      )}
    </div>
  );
}
