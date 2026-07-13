/**
 * The D28 right inspector: subject identity + claim envelopes + counts + omission/expansion
 * handles.
 *
 * TRUST GRAMMAR (D15/D33). Every number here is a store fact, and an aggregate names its
 * constituents rather than a count and a first id: `constituentClaimIds` is printed in full
 * behind an expansion handle, and the tier the aggregate is allowed to claim is its WEAKEST
 * constituent's — never an average, never a majority, never the strongest.
 *
 * OMISSION IS A FIRST-CLASS ROW (D40). Whatever the projection did not draw is listed here
 * with its exact count. A view that silently truncated is a defect of the same class as
 * compile-time truncation; a view that says "12 more, and here is the handle" is a product.
 *
 * SCROLL OWNERSHIP: its own container, its own height budget — never sharing a flex column
 * with the rail (D28).
 */
import { useState } from "react";
import type { AggregateEdge, BoundedProjection, GuideTree, TreeNode } from "../data/dto.ts";
import { useView } from "../state/view.ts";

export function Inspector(props: {
  overview: BoundedProjection;
  tree: GuideTree;
}): React.ReactNode {
  const { overview, tree } = props;
  const selectedId = useView((s) => s.selectedId);

  const container = overview.containers.find((c) => c.id === selectedId);
  const treeNode = selectedId === undefined ? undefined : findNode(tree.roots, selectedId);

  return (
    <div
      data-testid="inspector"
      className="flex h-full min-h-0 flex-col border-l border-zinc-800 bg-zinc-950"
    >
      <header className="shrink-0 border-b border-zinc-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Inspector</h2>
      </header>

      {/* Independent scroll owner. See the rail's note — this is the other half of it. */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3 text-sm">
        {selectedId === undefined ? (
          <Empty />
        ) : (
          <Subject
            id={selectedId}
            container={container}
            treeNode={treeNode}
            overview={overview}
          />
        )}
      </div>
    </div>
  );
}

function Empty(): React.ReactNode {
  return (
    <div data-testid="inspector-empty" className="text-zinc-500">
      <p>Nothing selected.</p>
      {/* This used to restate the axis rule as a universal ("a card above another one depends
          on it"), which the map itself contradicts on its cycle routes. The arrowhead is the
          claim that always holds; the axis strip states the spatial convention together with
          its exception, and it does not need repeating here. */}
      <p className="mt-2 text-xs">
        Click a card on the map or a row in the tree. On the map, a route&apos;s arrowhead
        points at what is depended on.
      </p>
    </div>
  );
}

function Subject(props: {
  id: string;
  container: BoundedProjection["containers"][number] | undefined;
  treeNode: TreeNode | undefined;
  overview: BoundedProjection;
}): React.ReactNode {
  const { id, container, treeNode, overview } = props;

  const name = container?.name ?? treeNode?.name ?? id;
  const path = container?.path ?? treeNode?.path ?? "";
  const kind = container?.grain ?? treeNode?.kind ?? "unknown";

  const inbound = overview.edges.filter((e) => e.dst === id);
  const outbound = overview.edges.filter((e) => e.src === id);

  return (
    <div data-testid="inspector-subject" className="flex flex-col gap-4">
      {/* Identity. Sticky, per D15 — you never lose track of what you are reading about. */}
      <section>
        <h3 data-role="subject-name" className="font-mono text-base font-semibold text-zinc-100">
          {name}
        </h3>
        <p className="mt-0.5 break-all font-mono text-xs text-zinc-500">{path || "—"}</p>
        <p className="mt-1 text-xs uppercase tracking-wide text-zinc-600">{kind}</p>
      </section>

      {/* Counts. The complete atlas numbers, never the drawn ones. */}
      {treeNode ? (
        <Facts
          rows={[
            ["files", treeNode.fileCount],
            ["declarations", treeNode.declarationCount],
            ["changed recently", treeNode.attention.changed],
            ["needs review", treeNode.attention.needsReview],
            ["conflicts", treeNode.attention.conflict],
          ]}
        />
      ) : null}

      {container ? (
        <Facts
          rows={[
            ["depended on by", container.degree.inbound],
            ["depends on", container.degree.outbound],
          ]}
        />
      ) : null}

      {container?.noVisibleRoute ? (
        <p data-testid="inspector-periphery" className="rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-400">
          No <code>calls</code> or <code>imports</code> relation in this projection reaches this
          scope. It sits in the honest periphery — it is not hidden, and it is not central.
        </p>
      ) : null}

      <Envelopes title="Depended on by" edges={inbound} peer={(e) => e.src} />
      <Envelopes title="Depends on" edges={outbound} peer={(e) => e.dst} />

      {/* Every omission the budget caused, with its exact count and the reason. */}
      {overview.omitted.notes.length > 0 ? (
        <section data-testid="inspector-omissions">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Omitted</h4>
          <ul className="mt-1 space-y-0.5 text-xs text-amber-300">
            {overview.omitted.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Facts(props: { rows: readonly (readonly [string, number])[] }): React.ReactNode {
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 text-xs">
      {props.rows.map(([label, value]) => (
        <div key={label} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-zinc-500">{label}</dt>
          <dd className="text-right font-mono text-zinc-200">{value.toLocaleString("en-US")}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A claim envelope per aggregate relation (D33). The count is a HANDLE: opening it lists the
 * constituent claim ids — all of them. "Count + first id" is exactly what D33 forbids, so the
 * expansion is not a nicety, it is the thing that makes the count claim-backed at all.
 */
function Envelopes(props: {
  title: string;
  edges: readonly AggregateEdge[];
  peer: (edge: AggregateEdge) => string;
}): React.ReactNode {
  if (props.edges.length === 0) {
    return (
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          {props.title}
        </h4>
        <p className="mt-1 text-xs text-zinc-600">None in this projection.</p>
      </section>
    );
  }
  return (
    <section>
      <h4 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
        {props.title}
      </h4>
      <ul className="mt-1 space-y-1">
        {props.edges.map((edge) => (
          <li key={edge.id}>
            <Envelope edge={edge} peer={props.peer(edge)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function Envelope(props: { edge: AggregateEdge; peer: string }): React.ReactNode {
  const [open, setOpen] = useState(false);
  const claims = props.edge.claimSet;
  const peerName = props.peer.startsWith("scope:") ? props.peer.slice(6) : props.peer;

  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/60 px-2 py-1.5">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xs text-zinc-200">{peerName}</span>
        <span className="ml-auto shrink-0 text-xs text-zinc-500">{claims.relationKind}</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-2 text-xs text-zinc-500">
        <span className="font-mono text-zinc-300">{claims.count}</span>
        <span>relations</span>
        <span className="text-zinc-700">·</span>
        {/* The weakest tier is the ONLY tier this aggregate may present (PRODUCT-DESIGN §3). */}
        <span className="text-zinc-300">{claims.confidenceSummary.weakest ?? "unknown"}</span>
        <span className="text-zinc-700">·</span>
        <span className={claims.freshness === "fresh" ? "text-emerald-400" : "text-amber-300"}>
          {claims.freshness}
        </span>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        data-testid={`envelope-handle-${props.edge.id}`}
        className="mt-1 text-xs text-sky-400 hover:text-sky-300"
      >
        {open ? "Hide" : "Show"} {claims.constituentClaimIds.length} constituent claims
        {claims.omittedCount > 0 ? ` (+${claims.omittedCount} not individually reachable)` : ""}
      </button>

      {open ? (
        <div className="mt-1 space-y-1">
          <p className="break-all font-mono text-[11px] leading-relaxed text-zinc-500">
            {claims.constituentClaimIds.join(" ")}
          </p>
          <dl className="grid grid-cols-[auto_1fr] gap-x-2 text-[11px] text-zinc-600">
            <dt>derivations</dt>
            <dd className="text-zinc-400">
              {claims.derivations.map((d) => d ?? "unknown").join(", ") || "—"}
            </dd>
            <dt>generations</dt>
            <dd className="text-zinc-400">{claims.evidenceGenerations.join(", ") || "—"}</dd>
            <dt>revisions</dt>
            <dd className="text-zinc-400">
              {claims.evidenceRevisions.length > 0
                ? claims.evidenceRevisions.map((r) => r.slice(0, 8)).join(", ")
                : `none carried (${claims.revisionsUnresolved} structural)`}
            </dd>
            <dt>disclosure</dt>
            <dd className="text-zinc-400">{claims.disclosure}</dd>
          </dl>
        </div>
      ) : null}
    </div>
  );
}

function findNode(nodes: readonly TreeNode[], id: string): TreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const hit = findNode(node.children, id);
    if (hit) return hit;
  }
  return undefined;
}
