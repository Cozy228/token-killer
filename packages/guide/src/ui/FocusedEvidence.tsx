// Focused-evidence panel (R4-3): the click reaction. A spike-level D14/D15
// preview (the full Inspector stays 5g). On selection it shows the node's kind +
// claim-status, name, path, its declarations (for a file), and directional-verb
// connection rows built from the logical edges — each row click-focuses the
// other endpoint and carries provenance (claim id). Copy obeys the D24 gate.

import type { AtlasModel } from "../atlas/types.js";

interface ConnRow {
  verb: string;
  nodeId: string;
  name: string;
  pathTail: string;
  constituentClaimIds: number[];
  omittedClaimCount: number;
}

/** "N claims" label + full-id hover title (D33 aggregate trust). */
function claimsText(ids: number[], omitted: number): string {
  const n = ids.length + omitted;
  return n === 1 ? "1 claim" : `${n} claims`;
}
function claimsTitle(ids: number[], omitted: number): string {
  if (ids.length === 0) return "no claim id";
  const base = `claim_ids=${ids.join(",")}`;
  return omitted > 0 ? `${base} (+${omitted} more)` : base;
}

const ROW_CAP = 12;

function tail(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

export function FocusedEvidence(props: {
  model: AtlasModel;
  selectedId: string;
  onFocus: (id: string) => void;
  /** Open the focused Connections view rooted on this node (files/decls only). */
  onOpenConnections?: (id: string) => void;
}) {
  const { model, selectedId, onFocus, onOpenConnections } = props;
  const node = model.nodeIndex.get(selectedId);
  if (!node) return null;
  const canConnect = node.kind === "file" || node.kind === "decl";

  const decls =
    node.kind === "file" ? model.nodes.filter((n) => n.parent === node.id && n.kind === "decl") : [];

  const rows: ConnRow[] = [];
  const add = (verb: string, otherId: string, ids: number[], omitted: number) => {
    const o = model.nodeIndex.get(otherId);
    rows.push({
      verb,
      nodeId: otherId,
      name: o?.name ?? otherId,
      pathTail: o ? tail(o.path) : otherId,
      constituentClaimIds: ids,
      omittedClaimCount: omitted,
    });
  };
  if (node.kind === "decl") {
    for (const e of model.edges.sym) {
      if (e.src === selectedId) add("calls →", e.dst, e.constituentClaimIds, e.omittedClaimCount);
      else if (e.dst === selectedId) add("← called by", e.src, e.constituentClaimIds, e.omittedClaimCount);
    }
  } else if (node.kind === "file") {
    for (const e of model.edges.file) {
      if (e.src === selectedId)
        add(e.kind === "calls" ? "calls →" : "imports →", e.dst, e.constituentClaimIds, e.omittedClaimCount);
      else if (e.dst === selectedId)
        add(
          e.kind === "calls" ? "← called by" : "← imported by",
          e.src,
          e.constituentClaimIds,
          e.omittedClaimCount,
        );
    }
  }

  const shownRows = rows.slice(0, ROW_CAP);
  const moreRows = rows.length - shownRows.length;
  const shownDecls = decls.slice(0, ROW_CAP);
  const moreDecls = decls.length - shownDecls.length;

  return (
    <section className="focused-evidence" aria-label="focused evidence">
      <header className="fe-header">
        <div className="fe-title">
          <span className="fe-kind">{node.kind}</span>
          <span className={`fe-status status-${node.status}`}>{node.status}</span>
        </div>
        <div className="fe-name">{node.name}</div>
        <div className="fe-path mono">{node.path}</div>
        {onOpenConnections && canConnect ? (
          <button
            type="button"
            className="fe-connections"
            onClick={() => onOpenConnections(selectedId)}
          >
            Connections
          </button>
        ) : null}
      </header>

      {node.kind === "file" ? (
        <div className="fe-block">
          <h4 className="fe-block-title">Declared here ({decls.length})</h4>
          {decls.length === 0 ? <div className="fe-empty">No declarations.</div> : null}
          <ul className="fe-rows">
            {shownDecls.map((d) => (
              <li key={d.id}>
                <button type="button" className="fe-row" onClick={() => onFocus(d.id)}>
                  <span className="fe-row-name mono">{d.name}</span>
                  <span className="fe-row-kind">{d.symbolKind ?? "decl"}</span>
                </button>
              </li>
            ))}
          </ul>
          {moreDecls > 0 ? <div className="fe-more">+{moreDecls} more</div> : null}
        </div>
      ) : null}

      <div className="fe-block">
        <h4 className="fe-block-title">Connections ({rows.length})</h4>
        {rows.length === 0 ? <div className="fe-empty">No observed connections.</div> : null}
        <ul className="fe-rows">
          {shownRows.map((r, i) => (
            <li key={`${r.verb}:${r.nodeId}:${i}`} className="fe-row-wrap">
              <button type="button" className="fe-row" onClick={() => onFocus(r.nodeId)}>
                <span className="fe-row-verb">{r.verb}</span>
                <span className="fe-row-name mono">{r.name}</span>
                <span className="fe-row-tail">{r.pathTail}</span>
                {r.constituentClaimIds.length > 0 || r.omittedClaimCount > 0 ? (
                  <span
                    className="fe-row-prov mono"
                    title={claimsTitle(r.constituentClaimIds, r.omittedClaimCount)}
                  >
                    {claimsText(r.constituentClaimIds, r.omittedClaimCount)}
                  </span>
                ) : null}
              </button>
              {onOpenConnections ? (
                <button
                  type="button"
                  className="fe-row-view"
                  title="Open the Connections view rooted on this node"
                  onClick={() => onOpenConnections(r.nodeId)}
                >
                  view
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {moreRows > 0 ? <div className="fe-more">+{moreRows} more</div> : null}
      </div>
    </section>
  );
}
