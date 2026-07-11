/**
 * Orient (P40 R15 J1) — the entry surface. NOT a canvas (R14 bans a global layout
 * over the entity set): a repo-orientation dashboard answering "what is this repo,
 * what's fresh, what needs my attention, what's busy". Repo identity + per-source
 * freshness/coverage + real needs-review/conflict counts (S1) + hot areas (the
 * honest "what changed" signal, each drillable to a subject). Kind composition
 * appears only as a thin neutral strip, never as the group boxes v2 shipped.
 * A genuinely empty store renders the exact `ctx sync` instruction (G-empty-state).
 */
import { useEffect } from "react";
import { ArrowRight } from "@phosphor-icons/react";
import type { CanvasProjection } from "@contexa/core";
import type { AsyncState } from "../util.ts";
import { statusCounts } from "../util.ts";
import { navigate } from "../router.ts";
import { useApp } from "../appContext.ts";

/** Neutral shades for the structural composition strip (kinds are not claims → no hue). */
const SHADES = ["#8b93a1", "#7a8290", "#69707d", "#585f6b", "#474d58", "#3a3f49", "#2e333c"];

export function Orient({ canvas }: { canvas: AsyncState<CanvasProjection> }): React.ReactElement {
  const { setScope } = useApp();
  const c = canvas.data;

  useEffect(() => {
    if (c) setScope(statusCounts(c), "entities on the entry surface");
  }, [c, setScope]);

  if (canvas.loading) return <div className="loading">Loading the repo…</div>;
  if (canvas.error) return <div className="err">Failed to load: {canvas.error.message}</div>;
  if (!c) return <div className="err">No projection.</div>;

  const total = c.sources.reduce((a, s) => a + s.entityCount, 0);

  if (total === 0) {
    return (
      <div className="wrap">
        <div className="empty-state">
          <h1>No index yet</h1>
          <p>
            This repo hasn't been ingested. Build the context graph — symbols, files, docs, commits,
            decisions, and memory — by running:
          </p>
          <div className="cmd">ctx sync</div>
          <p className="muted" style={{ marginTop: 16 }}>
            Then reload this page. The guide serves whatever <code>ctx sync</code> indexes.
          </p>
        </div>
      </div>
    );
  }

  const nonEmptyClusters = c.clusters.filter((cl) => cl.size > 0).sort((a, b) => b.size - a.size);

  return (
    <div className="wrap">
      <p className="eyebrow">Orient</p>
      <h1 className="page">What is in this repo</h1>
      <p className="lead">
        A cited, read-only twin of this repo's knowledge graph. Everything below resolves to
        evidence; the only color is a claim's trust status.
      </p>

      <div className="metrics">
        <div className="metric">
          <div className="k">entities</div>
          <div className="v num">{total.toLocaleString()}</div>
        </div>
        <div className="metric">
          <div className="k">needs review</div>
          <div className="v num attn" data-nonzero={c.badges.needsReview > 0}>
            {c.badges.needsReview}
          </div>
        </div>
        <div className="metric">
          <div className="k">open conflicts</div>
          <div className="v num attn" data-nonzero={c.badges.openConflicts > 0}>
            {c.badges.openConflicts}
          </div>
        </div>
        <div className="metric">
          <div className="k">sources</div>
          <div className="v num">{c.sources.length}</div>
        </div>
      </div>

      <div className="grid cols-2">
        <section className="panel">
          <header>
            <h2>Sources</h2>
            <span className="sub">freshness · coverage · generation</span>
          </header>
          <div className="body">
            {c.sources.map((s) => (
              <div className="srcrow" key={s.source}>
                <span className="sname">{s.source}</span>
                <div>
                  <div className="bar">
                    <span style={{ width: `${Math.round(s.coverage * 100)}%` }} />
                  </div>
                  <div className="cov num">
                    {s.entityCount.toLocaleString()} · {Math.round(s.coverage * 100)}%
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="gen num">gen {s.publishedGen}</div>
                  {s.cursorPosition === undefined ? (
                    <div className="stale-flag">no cursor</div>
                  ) : (
                    <div className="gen num">cur {String(s.cursorPosition).slice(0, 10)}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <header>
            <h2>Needs my attention</h2>
            <span className="sub">actionable now</span>
          </header>
          <div className="body">
            <div className="attn-list">
              <button
                type="button"
                className="attn"
                onClick={() => navigate({ view: "review", tab: "queue" })}
              >
                <span className="n" data-status="stale">
                  {c.badges.needsReview}
                </span>
                <span className="lbl">
                  needs-review
                  <small>memory notes awaiting a human confirm/retire</small>
                </span>
                <ArrowRight className="go" size={16} />
              </button>
              <button
                type="button"
                className="attn"
                onClick={() => navigate({ view: "review", tab: "conflicts" })}
              >
                <span className="n" data-status="conflicting">
                  {c.badges.openConflicts}
                </span>
                <span className="lbl">
                  open conflicts
                  <small>contradictions & stale-suspects to resolve</small>
                </span>
                <ArrowRight className="go" size={16} />
              </button>
              {c.badges.e8StaleSources.length > 0 && (
                <button
                  type="button"
                  className="attn"
                  onClick={() => navigate({ view: "review", tab: "health" })}
                >
                  <span className="n" data-status="stale">
                    {c.badges.e8StaleSources.length}
                  </span>
                  <span className="lbl">
                    sources without a cursor
                    <small>{c.badges.e8StaleSources.join(", ")}</small>
                  </span>
                  <ArrowRight className="go" size={16} />
                </button>
              )}
            </div>
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 16 }}>
        <header>
          <h2>Hot areas</h2>
          <span className="sub">most touched / co-changed — where work is happening</span>
        </header>
        <div className="body">
          {c.hotAreas.length === 0 ? (
            <p className="muted">No co-change/touch heat recorded yet.</p>
          ) : (
            <div className="rows">
              {c.hotAreas.map((h) => (
                <button
                  key={h.entityId}
                  type="button"
                  className="erow"
                  onClick={() => navigate({ view: "subject", ref: h.entityId })}
                >
                  <span className="ename">{h.name}</span>
                  <span className="heat">heat {h.heat}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <header>
          <h2>Composition</h2>
          <span className="sub">entity kinds (structural — not a claim, so no color)</span>
        </header>
        <div className="body">
          <div className="composition">
            {nonEmptyClusters.map((cl, i) => (
              <span
                key={cl.kind}
                title={`${cl.kind}: ${cl.size}`}
                style={{ width: `${(cl.size / total) * 100}%`, background: SHADES[i % SHADES.length] }}
              />
            ))}
          </div>
          <div className="complegend">
            {nonEmptyClusters.map((cl, i) => (
              <span key={cl.kind}>
                <i style={{ background: SHADES[i % SHADES.length] }} />
                {cl.kind} {cl.size.toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
