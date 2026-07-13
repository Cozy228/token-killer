/**
 * The D28 left rail: the directory/scope tree, attention counts, the Evidence Rail's dock,
 * and navigation history.
 *
 * THE TREE IS DOM TEXT. It is not on the canvas, it is not transformed, it does not scale
 * with zoom — so it is legible at every zoom, including the ones where the map is deliberately
 * zoomed out. That is the whole reason D26 could retire the minimap: the tree and the
 * breadcrumb own orientation now, and a DOM tree cannot go unreadable.
 *
 * SCROLL OWNERSHIP. This rail is its OWN scroll container with its OWN height budget. D28
 * spells that out because the alternative — rail and inspector in one flex column — makes the
 * rail unreachable the moment the inspector has content, which is always.
 */
import { useMemo } from "react";
import type { AttentionCounts, GuideTree, TreeNode } from "../data/dto.ts";
import { useView } from "../state/view.ts";

export function Rail(props: { tree: GuideTree }): React.ReactNode {
  const tree = props.tree;
  const expanded = useView((s) => s.expanded);
  const toggle = useView((s) => s.toggleExpanded);
  const select = useView((s) => s.select);
  const selectedId = useView((s) => s.selectedId);
  const history = useView((s) => s.history);

  // The scopes are already sorted by the kernel; the rail never re-ranks them.
  const roots = tree.roots;

  return (
    <div data-testid="rail" className="flex h-full min-h-0 flex-col bg-zinc-950">
      {/* Attention counts — the repo header. */}
      <header className="shrink-0 border-b border-zinc-800 px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">Scopes</h2>
        <p data-testid="rail-attention" className="mt-1 text-xs text-zinc-500">
          {tree.attention.changed} changed in the last {tree.recentCommits} commits
        </p>
        {/* Attention that resolves to no code anchor is COUNTED, not hidden (D16/D33). A
            card reading "0 conflicts" would otherwise be indistinguishable from "we did not
            look" — and 4 conflicts and 113 needs-review memories really are open. */}
        {tree.unanchored.needsReview > 0 || tree.unanchored.conflict > 0 ? (
          <p data-testid="rail-unanchored" className="mt-0.5 text-xs text-zinc-600">
            {tree.unanchored.needsReview} needs-review · {tree.unanchored.conflict} conflicts
            {" "}with no code anchor
          </p>
        ) : null}
      </header>

      {/* THE tree. Independent scroll owner: `min-h-0` + `overflow-y-auto` inside a flex
          column is what actually gives it a height budget rather than letting it grow. */}
      <nav
        data-testid="rail-tree"
        aria-label="Directory and scope tree"
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1"
      >
        <ul className="text-sm">
          {roots.map((node) => (
            <Row
              key={node.id}
              node={node}
              depth={0}
              expanded={expanded}
              selectedId={selectedId}
              onToggle={toggle}
              onSelect={select}
            />
          ))}
        </ul>
      </nav>

      {/* The Evidence Rail's dock (D23/D28). It exists here so slice T mounts into a place
          that already has a height budget, instead of stealing the tree's. */}
      <section
        data-testid="rail-dock"
        className="shrink-0 border-t border-zinc-800 px-3 py-2 text-xs text-zinc-600"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
          Evidence Rail
        </h2>
        <p className="mt-1">Opens with a change trace.</p>
      </section>

      {/* Navigation history (D28). Where the user has been, most recent first. */}
      <section
        data-testid="rail-history"
        className="max-h-40 shrink-0 overflow-y-auto border-t border-zinc-800 px-3 py-2"
      >
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-400">History</h2>
        {history.length === 0 ? (
          <p className="mt-1 text-xs text-zinc-600">Nothing visited yet.</p>
        ) : (
          <ol className="mt-1 space-y-0.5">
            {history.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => select(entry.id, entry.source, entry.label)}
                  className="w-full truncate text-left font-mono text-xs text-zinc-400 hover:text-zinc-200"
                  title={entry.label}
                >
                  {entry.label}
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function Row(props: {
  node: TreeNode;
  depth: number;
  expanded: ReadonlySet<string>;
  selectedId: string | undefined;
  onToggle: (id: string) => void;
  onSelect: (id: string, from: "tree", label: string) => void;
}): React.ReactNode {
  const { node, depth, expanded, selectedId } = props;
  // Scopes open by default: E1 requires a legible tree at cold open, and a tree of nine
  // collapsed rows tells a stranger nothing. Deeper levels are explicit (D27: content
  // changes only on an explicit expand).
  const isOpen = node.kind === "scope" ? !expanded.has(node.id) : expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.id;

  return (
    <li>
      <div
        data-tree-row={node.id}
        data-tree-kind={node.kind}
        data-selected={isSelected ? "true" : "false"}
        className={[
          "group flex items-center gap-1 pr-2",
          isSelected ? "bg-sky-500/15" : "hover:bg-zinc-900",
        ].join(" ")}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <button
          type="button"
          aria-label={hasChildren ? (isOpen ? "Collapse" : "Expand") : undefined}
          aria-expanded={hasChildren ? isOpen : undefined}
          onClick={() => hasChildren && props.onToggle(node.id)}
          className="w-3 shrink-0 text-center text-xs text-zinc-600 hover:text-zinc-300"
          tabIndex={hasChildren ? 0 : -1}
        >
          {hasChildren ? (isOpen ? "▾" : "▸") : ""}
        </button>

        <button
          type="button"
          onClick={() => props.onSelect(node.id, "tree", node.path || node.name)}
          className="flex min-w-0 flex-1 items-baseline gap-2 py-0.5 text-left"
          title={node.path || node.name}
        >
          {/* Never an unlabelled row — E1 does not stop at the canvas edge. */}
          <span
            data-role="name"
            className={[
              "truncate",
              node.kind === "scope"
                ? "font-mono font-medium text-zinc-100"
                : node.kind === "dir"
                  ? "text-zinc-300"
                  : "font-mono text-zinc-400",
            ].join(" ")}
          >
            {node.name}
          </span>
          <Attention counts={node.attention} />
          <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-600">
            {node.kind === "file" ? node.declarationCount : node.fileCount}
          </span>
        </button>
      </div>

      {isOpen && hasChildren ? (
        <ul>
          {node.children.map((child) => (
            <Row key={child.id} {...props} node={child} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

/** The rail's attention marks. Zero renders nothing — a row of zeroes is noise, not honesty;
 *  the honest zero lives once, in the header, where its cause is named. */
function Attention(props: { counts: AttentionCounts }): React.ReactNode {
  const { changed, needsReview, conflict } = props.counts;
  const marks = useMemo(
    () =>
      [
        changed > 0 ? { n: changed, tone: "text-amber-400", title: "changed recently" } : undefined,
        needsReview > 0
          ? { n: needsReview, tone: "text-sky-400", title: "needs review" }
          : undefined,
        conflict > 0 ? { n: conflict, tone: "text-rose-400", title: "conflict" } : undefined,
      ].filter((m): m is { n: number; tone: string; title: string } => m !== undefined),
    [changed, needsReview, conflict],
  );
  if (marks.length === 0) return null;
  return (
    <span className="flex shrink-0 items-baseline gap-1">
      {marks.map((mark) => (
        <span key={mark.title} className={`${mark.tone} text-[11px]`} title={mark.title}>
          {mark.n}
        </span>
      ))}
    </span>
  );
}
