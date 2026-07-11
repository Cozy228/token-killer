/**
 * Canvas (entry, brief §3.1) — the whole graph flat: source clusters on a React
 * Flow field, an omnibox on top, live badges, a side preview panel, the Claim
 * Legend dock, and time/churn lens toggles. Node KIND is shape/icon/typography,
 * never hue (design §1); only status marks + the cobalt accent are saturated.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { CanvasProjection, ClaimStatus } from "@contexa/core";
import { getCanvas, getChurnLens, getTimeLens, getSearch } from "../api.ts";
import { useAsync } from "../util.ts";
import { EnvelopeChip } from "../components/EnvelopeChip.tsx";
import { ClaimLegend } from "../components/ClaimLegend.tsx";
import { layout } from "./layout.ts";

interface ClusterData extends Record<string, unknown> {
  label: string;
  kind: string;
  size: number;
}

function ClusterNode({ data }: NodeProps): React.ReactElement {
  const d = data as ClusterData;
  return (
    <div className="node">
      <span className="kicon" aria-hidden="true">
        ◈
      </span>
      <span>{d.label}</span> <span className="badge mono">{d.size}</span>
    </div>
  );
}

const nodeTypes = { cluster: ClusterNode };

export interface CanvasProps {
  active: Set<ClaimStatus>;
  onToggleStatus: (s: ClaimStatus) => void;
  onOpenSubject: (ref: string) => void;
  onOpenEvidence: (e: import("@contexa/core").EvidencePacket) => void;
}

export function Canvas({
  active,
  onToggleStatus,
  onOpenSubject,
  onOpenEvidence,
}: CanvasProps): React.ReactElement {
  const { data, loading, error } = useAsync<CanvasProjection>(getCanvas, []);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [lens, setLens] = useState<"none" | "time" | "churn">("none");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CanvasSearchHit[]>([]);

  // Build + lay out cluster nodes when data arrives.
  useEffect(() => {
    if (!data) return;
    const sized = data.clusters.map((c) => ({ id: c.id, width: 180, height: 44 }));
    const raw: Node[] = data.clusters.map((c) => ({
      id: c.id,
      type: "cluster",
      position: { x: 0, y: 0 },
      data: { label: c.label, kind: c.kind, size: c.size } satisfies ClusterData,
    }));
    layout(sized, []).then((pos) => {
      setNodes(raw.map((n) => ({ ...n, position: pos.get(n.id) ?? { x: 0, y: 0 } })));
    });
  }, [data]);

  const onNodeClick = useCallback((_e: unknown, node: Node) => setSelected(node.id), []);

  const runSearch = useCallback(async (q: string) => {
    setQuery(q);
    if (q.trim().length === 0) {
      setResults([]);
      return;
    }
    const proj = await getSearch(q);
    setResults(
      proj.hits.map((h) => ({ entityId: h.entityId, name: h.name, kind: h.kind, status: h.evidence.envelope.status })),
    );
  }, []);

  const cluster = useMemo(
    () => data?.clusters.find((c) => c.id === selected),
    [data, selected],
  );

  if (loading) return <div className="pad empty">Loading graph…</div>;
  if (error) return <div className="pad empty">Store not reachable: {error.message}</div>;
  if (!data) return <div className="pad empty">No graph.</div>;
  if (data.clusters.length === 0) {
    return (
      <div className="pad empty">
        No graph yet. Index this repo first:
        <div className="cli">ctx sync</div>
      </div>
    );
  }

  const counts: Record<string, number> = {};
  for (const b of [data.badges]) {
    counts.conflicting = b.openConflicts;
  }

  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div className="omnibox">
        <input
          aria-label="Search the graph (omnibox)"
          placeholder="Search symbols, docs, memory notes…  (/ or Cmd+K)"
          value={query}
          onChange={(e) => void runSearch(e.target.value)}
        />
        {results.length > 0 && (
          <div className="results" role="listbox">
            {results.map((r) => (
              <button
                key={r.entityId}
                type="button"
                className="r"
                data-status={r.status}
                onClick={() => onOpenSubject(r.entityId)}
              >
                <span className="mark mark-observed" style={{ color: "var(--status-hue)" }} aria-hidden />
                <span>{r.name}</span>
                <span className="kind">{r.kind}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ position: "absolute", top: 12, right: 12, zIndex: 10, display: "flex", gap: 4 }}>
        {(["none", "time", "churn"] as const).map((l) => (
          <button
            key={l}
            type="button"
            className="tab"
            aria-current={lens === l ? "page" : undefined}
            onClick={() => setLens(l)}
          >
            {l === "none" ? "graph" : `${l} lens`}
          </button>
        ))}
      </div>

      <ReactFlow
        nodes={nodes}
        edges={[]}
        nodeTypes={nodeTypes}
        onNodeClick={onNodeClick}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background />
        <Controls />
        <MiniMap pannable zoomable />
      </ReactFlow>

      <ClaimLegend counts={counts} active={active} onToggle={onToggleStatus} />

      {cluster && (
        <div className="drawer" role="dialog" aria-label={`${cluster.label} preview`}>
          <button type="button" className="close" onClick={() => setSelected(null)}>
            Close
          </button>
          <h2>
            {cluster.label} <span className="mono">({cluster.size})</span>
          </h2>
          <p className="empty">Showing {cluster.members.length} of {cluster.size} (budget-bounded).</p>
          <table className="data">
            <tbody>
              {cluster.members
                .filter((m) => active.size === 0 || active.has(m.evidence.envelope.status))
                .map((m) => (
                  <tr key={m.entityId}>
                    <td>
                      <button type="button" className="tab" onClick={() => onOpenSubject(m.entityId)}>
                        {m.name}
                      </button>
                    </td>
                    <td>
                      <EnvelopeChip evidence={m.evidence} onOpenEvidence={onOpenEvidence} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      {lens !== "none" && <LensOverlay lens={lens} />}
    </div>
  );
}

interface CanvasSearchHit {
  entityId: string;
  name: string;
  kind: string;
  status: ClaimStatus;
}

function LensOverlay({ lens }: { lens: "time" | "churn" }): React.ReactElement {
  const time = useAsync(getTimeLens, [lens === "time"]);
  const churn = useAsync(getChurnLens, [lens === "churn"]);
  return (
    <div className="panel" style={{ position: "absolute", bottom: 12, right: 12, maxWidth: 320, zIndex: 10 }}>
      <h3 className="mono">{lens} lens</h3>
      {lens === "time" &&
        (time.data?.chains ?? []).slice(0, 6).map((c, i) => (
          <div key={i} className="factrow">
            <span className="mono">{c.fromName}</span> supersedes <span className="mono">{c.toName}</span>
          </div>
        ))}
      {lens === "churn" &&
        (churn.data?.clusters ?? []).slice(0, 6).map((c, i) => (
          <div key={i} className="factrow">
            <span className="mono">{c.members.map((m) => m.name).join(" · ")}</span>
          </div>
        ))}
    </div>
  );
}
