/**
 * Review (P40 R15 J4 + J5) — the worklist. The one v2 screen that worked on real
 * data, kept and widened: needs-review queue with the EXACT copyable CLI command
 * (never executed, R1), conflicts grouped by reason class with resolving commands,
 * push preview (verbatim would-be digest + byte budget + pins/vetoes), per-source
 * health/freshness, and a memory browser (zones + lifecycle chains). Every command
 * is copyable text; no route mutates the store.
 */
import { useEffect, useState } from "react";
import { Copy, Check } from "@phosphor-icons/react";
import type { InspectorProjection } from "@contexa/core";
import { getInspector } from "../api.ts";
import { useAsync, statusCounts } from "../util.ts";
import { useApp } from "../appContext.ts";
import { navigate } from "../router.ts";
import { EnvelopeChip } from "../components/EnvelopeChip.tsx";

const TABS = ["queue", "conflicts", "push", "health", "memory"] as const;

function CopyCli({ command }: { command: string }): React.ReactElement {
  const [done, setDone] = useState(false);
  const copy = (): void => {
    void navigator.clipboard?.writeText(command).then(
      () => {
        setDone(true);
        setTimeout(() => setDone(false), 1200);
      },
      () => {},
    );
  };
  return (
    <div className="cli">
      <span className="prompt">$</span>
      <span>{command}</span>
      <button type="button" className="icon-btn copy" onClick={copy} aria-label="Copy command">
        {done ? <Check size={14} /> : <Copy size={14} />}
      </button>
    </div>
  );
}

export function Review({ tab }: { tab: string }): React.ReactElement {
  const { openEvidence, setScope } = useApp();
  const state = useAsync<InspectorProjection>(getInspector, []);
  const insp = state.data;

  useEffect(() => {
    if (insp) setScope(statusCounts(insp), "claims in the worklist");
  }, [insp, setScope]);

  const activeTab = (TABS as readonly string[]).includes(tab) ? tab : "queue";

  return (
    <div className="wrap">
      <p className="eyebrow">Review</p>
      <h1 className="page">Curate & push</h1>

      <div className="tabs" role="tablist">
        {TABS.map((t) => {
          const badge =
            t === "queue"
              ? insp?.reviewQueue.length
              : t === "conflicts"
                ? insp?.conflicts.reduce((a, g) => a + g.items.length, 0)
                : undefined;
          return (
            <button
              key={t}
              type="button"
              role="tab"
              aria-current={activeTab === t}
              onClick={() => navigate({ view: "review", tab: t })}
            >
              {t}
              {badge ? <span className="pill num">{badge}</span> : null}
            </button>
          );
        })}
      </div>

      {state.loading && <div className="loading">Loading worklist…</div>}
      {state.error && <div className="err">Failed: {state.error.message}</div>}
      {insp && (
        <>
          {activeTab === "queue" && (
            <section className="panel">
              <header>
                <h2>Needs review</h2>
                <span className="sub">{insp.reviewQueue.length} note(s) awaiting a human</span>
              </header>
              <div className="body">
                {insp.reviewQueue.length === 0 ? (
                  <p className="muted">Nothing needs review. The overlay is clean.</p>
                ) : (
                  insp.reviewQueue.map((q) => (
                    <div className="qitem" key={q.entityId}>
                      <div className="gist" style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <EnvelopeChip evidence={q.evidence} onOpenEvidence={openEvidence} />
                        <button
                          type="button"
                          className="val"
                          style={{ background: "transparent", border: 0, color: "inherit", cursor: "pointer", textAlign: "left" }}
                          onClick={() => navigate({ view: "subject", ref: q.entityId })}
                        >
                          {q.gist}
                        </button>
                      </div>
                      <CopyCli command={q.cliCommand} />
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {activeTab === "conflicts" && (
            <section className="panel">
              <header>
                <h2>Open conflicts</h2>
                <span className="sub">state, grouped by reason class</span>
              </header>
              <div className="body">
                {insp.conflicts.length === 0 ? (
                  <p className="muted">No open conflicts.</p>
                ) : (
                  insp.conflicts.map((g) => (
                    <div key={g.reasonClass}>
                      <p className="reason">{g.reasonClass}</p>
                      {g.items.map((it, i) => (
                        <div className="conflict" key={i}>
                          <div className="pair">
                            <span className="mono">{it.subjectA}</span>
                            {" ↔ "}
                            <span className="mono">{it.subjectB}</span>
                          </div>
                          <CopyCli command={it.cliCommand} />
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {activeTab === "push" && (
            <section className="panel">
              <header>
                <h2>Push preview</h2>
                <span className="sub">verbatim would-be digest — displayed, never pushed (R1)</span>
              </header>
              <div className="body">
                <div className="budgetbar">
                  <span className="num">{insp.pushPreview.bytes} B</span>
                  <div className="track">
                    <span
                      style={{
                        width: `${Math.min(100, (insp.pushPreview.bytes / insp.pushPreview.budgetBytes) * 100)}%`,
                      }}
                      data-over={insp.pushPreview.bytes > insp.pushPreview.budgetBytes}
                    />
                  </div>
                  <span className="muted num">budget {insp.pushPreview.budgetBytes} B</span>
                </div>
                {insp.pushPreview.omittedGotchas > 0 && (
                  <p className="omit-note">
                    {insp.pushPreview.omittedGotchas} memory gotcha(s) omitted from the block —
                    query the context MCP tool for cited claims.
                  </p>
                )}
                {(insp.pushPreview.pins.length > 0 || insp.pushPreview.vetoes.length > 0) && (
                  <p className="muted" style={{ fontSize: 12 }}>
                    pins: {insp.pushPreview.pins.join(", ") || "—"} · vetoes:{" "}
                    {insp.pushPreview.vetoes.join(", ") || "—"}
                  </p>
                )}
                <pre className="digest">{insp.pushPreview.digestText}</pre>
              </div>
            </section>
          )}

          {activeTab === "health" && (
            <section className="panel">
              <header>
                <h2>Health</h2>
                <span className="sub">
                  per-source generation & cursor · needs-review {insp.health.needsReview} · conflicts{" "}
                  {insp.health.openConflicts}
                </span>
              </header>
              <div className="body">
                {insp.health.sources.map((h) => (
                  <div className="srcrow" key={h.source}>
                    <span className="sname">{h.source}</span>
                    <span className="gen num">gen {h.publishedGen}</span>
                    <div style={{ textAlign: "right" }}>
                      {h.stale ? (
                        <span className="stale-flag">no cursor (E8)</span>
                      ) : (
                        <span className="gen num">
                          cur {String(h.cursorPosition).slice(0, 12)}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeTab === "memory" && (
            <section className="panel">
              <header>
                <h2>Memory browser</h2>
                <span className="sub">zones · origin · lifecycle</span>
              </header>
              <div className="body">
                <div className="zones">
                  <div className="zone">
                    <div className="zv num">{insp.memoryBrowser.zones.mainline}</div>
                    <div className="zk">mainline (shared)</div>
                  </div>
                  <div className="zone">
                    <div className="zv num">{insp.memoryBrowser.zones.overlay}</div>
                    <div className="zk">overlay (personal)</div>
                  </div>
                  <div className="zone">
                    <div className="zv num">{insp.memoryBrowser.zones.unknown}</div>
                    <div className="zk">unknown</div>
                  </div>
                </div>
                <div className="rows">
                  {insp.memoryBrowser.entries.slice(0, 60).map((m) => (
                    <button
                      key={m.entityId}
                      type="button"
                      className="erow"
                      onClick={() => navigate({ view: "subject", ref: m.entityId })}
                    >
                      <span className="kind">{m.zone}</span>
                      <span className="ename">{m.gist}</span>
                      <span className="loc">{m.status}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
