// FocusGraph — the "Connections view" (Option A focus graph). A dismissible
// SHOW overlay proving the hybrid model: the atlas stays the map; connection
// READING happens in a focused local graph. THROWAWAY spike UI (M3 v4 Fable).
//
// It renders ONE subject node's connections as three columns with NO layout
// engine: center = the subject, left = inbound (what CALLS/IMPORTS it), right =
// outbound (what it calls/imports). Counterparts inside the subject's package
// are full cards with short SVG connectors (count-labelled, solid=calls /
// dashed=imports, arrow into/out of the subject). Counterparts outside the
// package (or beyond the card cap) collapse into UA-style boundary pills.
// Clicking any card or pill RE-ROOTS the view on that node (breadcrumb + back).
//
// Copy obeys the D24 naming gate (no impact/affected/blast radius/risk/breaks).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fileId, fileOfSym } from "../atlas/compile.js";
import type { AtlasModel, AtlasNode, NodeStatus } from "../atlas/types.js";

// Cards per column before the rest spill into boundary pills.
const CARD_CAP = 8;
// Boundary pills shown before the "+N more" expander.
const PILL_SHOW = 6;

export interface FocusPair {
  from: string;
  to: string;
  count: number;
  claimId: number | null;
}

export interface FocusCounterpart {
  id: string;
  kind: "file" | "decl";
  name: string;
  path: string;
  pathTail: string;
  symbolKind?: string;
  status: NodeStatus;
  lit: boolean;
  callCount: number;
  importCount: number;
  relation: "calls" | "imports";
  count: number;
  claimId: number | null;
  fileId: string;
  fileName: string;
  filePathTail: string;
  pairs: FocusPair[];
}

export interface FocusPill {
  id: string;
  label: string;
  count: number;
  relation: "calls" | "imports";
  lit: boolean;
  /**
   * The counterpart at this edge endpoint is NOT in the indexed corpus (a
   * store-absent endpoint). Rendered as a non-rooting pill with a "not in index"
   * note rather than a broken card. Never re-roots (there is nothing to root on).
   */
  notInIndex?: boolean;
}

export interface FocusColumn {
  direction: "inbound" | "outbound";
  cards: FocusCounterpart[];
  pills: FocusPill[];
}

export interface FocusSubjectDecl {
  id: string;
  name: string;
  symbolKind?: string;
}

export interface FocusModel {
  subject: AtlasNode;
  subjectKind: "file" | "decl";
  declCount: number;
  /** The subject file's declarations (for the zero-connection decl list). */
  subjectDecls: FocusSubjectDecl[];
  package: string;
  inbound: FocusColumn;
  outbound: FocusColumn;
  /** True when the subject has no observed inbound/outbound connections at all. */
  hasConnections: boolean;
}

/**
 * Package boundary for the focus graph. In a monorepo (`packages/<pkg>/…`) the
 * package is `packages/<pkg>`; otherwise it falls back to the file's immediate
 * directory so cross-directory counterparts still read as boundary pills.
 */
export function packageOf(path: string): string {
  const segs = path.split("/");
  if (segs[0] === "packages" && segs.length >= 2) return `packages/${segs[1]}`;
  if (segs.length > 1) return segs.slice(0, -1).join("/");
  return "";
}

function tailOf(path: string, n = 2): string {
  const segs = path.split("/");
  return segs.length <= n ? path : segs.slice(-n).join("/");
}

function fileOf(node: AtlasNode): string {
  return node.kind === "decl" ? fileOfSym(node.id) : node.path;
}

/**
 * Pure derivation: CorpusModel + subject id -> the three-column focus model.
 * Exported for the render test. Returns null for a non-file / non-decl subject.
 */
export function buildFocusModel(
  model: AtlasModel,
  subjectId: string,
  litIds?: ReadonlySet<string>,
): FocusModel | null {
  const subject = model.nodeIndex.get(subjectId);
  if (!subject || (subject.kind !== "file" && subject.kind !== "decl")) return null;
  const subjectKind = subject.kind;
  const subjPath = fileOf(subject);
  const pkg = packageOf(subjPath);
  const isLit = (id: string) => litIds?.has(id) ?? false;

  const inbound = new Map<string, FocusCounterpart>();
  const outbound = new Map<string, FocusCounterpart>();

  // Store-absent endpoints (edge references a node not in the corpus index).
  interface Absent {
    id: string;
    count: number;
    relation: "calls" | "imports";
  }
  const absentIn = new Map<string, Absent>();
  const absentOut = new Map<string, Absent>();
  const bumpAbsent = (
    dir: "inbound" | "outbound",
    id: string,
    kind: "calls" | "imports",
    count: number,
  ) => {
    const map = dir === "inbound" ? absentIn : absentOut;
    const cur = map.get(id);
    if (cur) {
      cur.count += count;
      if (kind === "calls") cur.relation = "calls";
    } else {
      map.set(id, { id, count, relation: kind });
    }
  };

  const ensure = (dir: "inbound" | "outbound", node: AtlasNode): FocusCounterpart => {
    const map = dir === "inbound" ? inbound : outbound;
    let c = map.get(node.id);
    if (!c) {
      const fPath = fileOf(node);
      const fId = fileId(fPath);
      const fNode = model.nodeIndex.get(fId);
      c = {
        id: node.id,
        kind: node.kind === "decl" ? "decl" : "file",
        name: node.name,
        path: node.path,
        pathTail: tailOf(node.path),
        symbolKind: node.symbolKind,
        status: node.status,
        lit: isLit(node.id),
        callCount: 0,
        importCount: 0,
        relation: "calls",
        count: 0,
        claimId: null,
        fileId: fId,
        fileName: fNode?.name ?? tailOf(fPath, 1),
        filePathTail: tailOf(fPath),
        pairs: [],
      };
      map.set(node.id, c);
    }
    return c;
  };

  if (subjectKind === "file") {
    // File-level aggregated calls + imports.
    for (const e of model.edges.file) {
      let dir: "inbound" | "outbound" | null = null;
      let otherId: string | null = null;
      if (e.src === subjectId) {
        dir = "outbound";
        otherId = e.dst;
      } else if (e.dst === subjectId) {
        dir = "inbound";
        otherId = e.src;
      }
      if (!dir || !otherId) continue;
      const other = model.nodeIndex.get(otherId);
      if (!other) {
        bumpAbsent(dir, otherId, e.kind, e.count);
        continue;
      }
      const c = ensure(dir, other);
      if (e.kind === "calls") c.callCount += e.count;
      else c.importCount += e.count;
      if (c.claimId == null) c.claimId = e.claimId;
    }
    // Decl-level call pairs, attached to the counterpart file card (expandable).
    for (const e of model.edges.sym) {
      const sFile = fileId(fileOfSym(e.src));
      const dFile = fileId(fileOfSym(e.dst));
      let card: FocusCounterpart | undefined;
      let from = e.src;
      let to = e.dst;
      if (sFile === subjectId) card = outbound.get(dFile);
      else if (dFile === subjectId) {
        card = inbound.get(sFile);
        from = e.src;
        to = e.dst;
      }
      if (!card) continue;
      card.pairs.push({
        from: model.nodeIndex.get(from)?.name ?? from,
        to: model.nodeIndex.get(to)?.name ?? to,
        count: e.count,
        claimId: e.claimId,
      });
    }
  } else {
    // Decl subject: raw sym->sym calls.
    for (const e of model.edges.sym) {
      let dir: "inbound" | "outbound" | null = null;
      let otherId: string | null = null;
      if (e.src === subjectId) {
        dir = "outbound";
        otherId = e.dst;
      } else if (e.dst === subjectId) {
        dir = "inbound";
        otherId = e.src;
      }
      if (!dir || !otherId) continue;
      const other = model.nodeIndex.get(otherId);
      if (!other) {
        bumpAbsent(dir, otherId, "calls", e.count);
        continue;
      }
      const c = ensure(dir, other);
      c.callCount += e.count;
      if (c.claimId == null) c.claimId = e.claimId;
    }
  }

  const finalize = (c: FocusCounterpart) => {
    c.count = c.callCount + c.importCount;
    c.relation = c.callCount > 0 ? "calls" : "imports";
    c.pairs.sort((a, b) => b.count - a.count || (a.to < b.to ? -1 : 1));
  };
  for (const c of inbound.values()) finalize(c);
  for (const c of outbound.values()) finalize(c);

  const absentLabel = (id: string): string =>
    id.startsWith("sym:") ? id.slice(4) : id.startsWith("file:") ? id.slice(5) : id;

  const toColumn = (
    dir: "inbound" | "outbound",
    map: Map<string, FocusCounterpart>,
    absent: Map<string, Absent>,
  ): FocusColumn => {
    const all = [...map.values()].sort(
      (a, b) => b.count - a.count || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );
    const inPkg = all.filter((c) => packageOf(c.kind === "decl" ? fileOfSym(c.id) : c.path) === pkg);
    const outPkg = all.filter((c) => !inPkg.includes(c));
    const cards = inPkg.slice(0, CARD_CAP);
    const overflow = inPkg.slice(CARD_CAP);
    const pills: FocusPill[] = [...outPkg, ...overflow].map((c) => ({
      id: c.id,
      label: c.kind === "decl" ? `${fileOfSym(c.id)}#${c.name}` : c.path,
      count: c.count,
      relation: c.relation,
      lit: c.lit,
    }));
    // Store-absent endpoints become non-rooting pills with a "not in index" note.
    const absentPills: FocusPill[] = [...absent.values()]
      .sort((a, b) => b.count - a.count || (a.id < b.id ? -1 : 1))
      .map((a) => ({
        id: a.id,
        label: absentLabel(a.id),
        count: a.count,
        relation: a.relation,
        lit: false,
        notInIndex: true,
      }));
    return { direction: dir, cards, pills: [...pills, ...absentPills] };
  };

  const subjectDecls: FocusSubjectDecl[] =
    subjectKind === "file"
      ? model.nodes
          .filter((n) => n.parent === subject.id && n.kind === "decl")
          .map((n) => ({ id: n.id, name: n.name, symbolKind: n.symbolKind }))
      : [];
  const declCount = subjectDecls.length;

  const inboundCol = toColumn("inbound", inbound, absentIn);
  const outboundCol = toColumn("outbound", outbound, absentOut);
  const hasConnections =
    inboundCol.cards.length > 0 ||
    inboundCol.pills.length > 0 ||
    outboundCol.cards.length > 0 ||
    outboundCol.pills.length > 0;

  return {
    subject,
    subjectKind,
    declCount,
    subjectDecls,
    package: pkg,
    inbound: inboundCol,
    outbound: outboundCol,
    hasConnections,
  };
}

// ---------------------------------------------------------------------------
// Presentation
// ---------------------------------------------------------------------------

function StatusTick({ status }: { status: NodeStatus }) {
  if (status === "active") return null;
  return <span className={`fg-status status-${status}`}>{status}</span>;
}

function LitTick({ lit }: { lit: boolean }) {
  if (!lit) return null;
  return (
    <span className="fg-lit-tick" title="In the current Change Trace">
      <span className="fg-lit-dot" /> In Change Trace
    </span>
  );
}

function chipText(c: FocusCounterpart): string {
  const parts: string[] = [];
  if (c.callCount > 0) parts.push(`${c.callCount} ${c.callCount === 1 ? "call" : "calls"}`);
  if (c.importCount > 0) parts.push(`${c.importCount} ${c.importCount === 1 ? "import" : "imports"}`);
  return parts.join(" · ") || `${c.count} connections`;
}

/** Short SVG connector: line width log2(count+1) capped 5, count on the line. */
function Connector({
  count,
  relation,
  orientation,
  claimId,
}: {
  count: number;
  relation: "calls" | "imports";
  orientation: "inbound" | "outbound";
  claimId: number | null;
}) {
  const w = 58;
  const h = 26;
  const y = h / 2;
  const x1 = 4;
  const x2 = w - 9;
  const sw = Math.max(1, Math.min(5, Math.log2(count + 1)));
  const dash = relation === "imports" ? "5 3" : undefined;
  const title = `${relation} · count=${count}${claimId != null ? ` · claim_id=${claimId}` : ""}`;
  return (
    <svg
      className={`fg-connector fg-connector-${orientation}`}
      width={w}
      height={h}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <line
        x1={x1}
        y1={y}
        x2={x2}
        y2={y}
        strokeWidth={sw}
        strokeDasharray={dash}
        className={`fg-conn-line fg-conn-${relation}`}
      />
      <polygon
        points={`${x2},${y - 4} ${x2 + 7},${y} ${x2},${y + 4}`}
        className="fg-conn-arrow"
      />
      <text x={(x1 + x2) / 2} y={y - 4} className="fg-conn-count" textAnchor="middle">
        {count}
      </text>
    </svg>
  );
}

function Card({
  c,
  orientation,
  showFileHeader,
  onReroot,
  registerNav,
}: {
  c: FocusCounterpart;
  orientation: "inbound" | "outbound";
  showFileHeader: boolean;
  onReroot: (id: string) => void;
  registerNav: (id: string, el: HTMLButtonElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasPairs = c.pairs.length > 0;
  const connector = (
    <Connector count={c.count} relation={c.relation} orientation={orientation} claimId={c.claimId} />
  );
  const body = (
    <div className="fg-card-body">
      <button
        type="button"
        ref={(el) => registerNav(c.id, el)}
        className="fg-card-main"
        onClick={() => onReroot(c.id)}
        title={c.claimId != null ? `claim_id=${c.claimId}` : undefined}
      >
        <span className="fg-badge">
          {c.kind === "decl" ? `decl · ${c.symbolKind ?? "symbol"}` : "file"}
        </span>
        <span className="fg-card-name">{c.name}</span>
        <span className="fg-card-tail mono">{c.pathTail}</span>
        <span className={`fg-count fg-count-${c.relation}`}>{chipText(c)}</span>
        <StatusTick status={c.status} />
        <LitTick lit={c.lit} />
      </button>
      {hasPairs ? (
        <button
          type="button"
          className="fg-expand"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? "▾" : "▸"} {c.pairs.length} decl {c.pairs.length === 1 ? "pair" : "pairs"}
        </button>
      ) : null}
      {open && hasPairs ? (
        <ul className="fg-pairs">
          {c.pairs.map((p, i) => (
            <li key={`${p.from}:${p.to}:${i}`} className="fg-pair mono">
              <span className="fg-pair-from">{p.from}</span>
              <span className="fg-pair-arrow">→</span>
              <span className="fg-pair-to">{p.to}</span>
              <span className="fg-pair-count">{p.count}</span>
              {p.claimId != null ? (
                <span className="fg-pair-prov" title={`claim_id=${p.claimId}`}>
                  claim_id={p.claimId}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
  return (
    <li className={`fg-card fg-card-${orientation}`}>
      {showFileHeader ? <div className="fg-file-header mono">{c.filePathTail}</div> : null}
      <div className="fg-card-row">
        {orientation === "outbound" ? connector : null}
        {body}
        {orientation === "inbound" ? connector : null}
      </div>
    </li>
  );
}

function PillList({
  pills,
  onReroot,
  registerNav,
}: {
  pills: FocusPill[];
  onReroot: (id: string) => void;
  registerNav: (id: string, el: HTMLButtonElement | null) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (pills.length === 0) return null;
  const shown = expanded ? pills : pills.slice(0, PILL_SHOW);
  const more = pills.length - shown.length;
  return (
    <div className="fg-pills">
      <div className="fg-pills-title">Boundary connections</div>
      <ul className="fg-pill-list">
        {shown.map((p) =>
          p.notInIndex ? (
            // Store-absent endpoint: a non-rooting pill with an explicit note
            // rather than a broken card (there is nothing in the index to open).
            <li key={p.id}>
              <span className="fg-pill fg-pill-absent" title="This endpoint is not in the indexed corpus">
                <span className="fg-pill-label mono">{p.label}</span>
                <span className="fg-pill-note">not in index</span>
                <span className="fg-pill-count">
                  {p.count} {p.count === 1 ? "connection" : "connections"}
                </span>
              </span>
            </li>
          ) : (
            <li key={p.id}>
              <button
                type="button"
                ref={(el) => registerNav(p.id, el)}
                className={`fg-pill fg-pill-${p.relation}${p.lit ? " fg-pill-lit" : ""}`}
                onClick={() => onReroot(p.id)}
                title={`${p.relation} · ${p.count} connections`}
              >
                <span className="fg-pill-label mono">{p.label}</span>
                <span className="fg-pill-count">
                  {p.count} {p.count === 1 ? "connection" : "connections"}
                </span>
              </button>
            </li>
          ),
        )}
      </ul>
      {more > 0 ? (
        <button type="button" className="fg-more" onClick={() => setExpanded(true)}>
          +{more} more
        </button>
      ) : null}
    </div>
  );
}

/** Render one column (inbound = left, outbound = right). Decl subjects group
 *  cards under a file header; file subjects list one card per counterpart file. */
function Column({
  column,
  grouped,
  onReroot,
  registerNav,
}: {
  column: FocusColumn;
  grouped: boolean;
  onReroot: (id: string) => void;
  registerNav: (id: string, el: HTMLButtonElement | null) => void;
}) {
  const title = column.direction === "inbound" ? "Inbound" : "Outbound";
  const subtitle =
    column.direction === "inbound" ? "calls / imports into this node" : "what this node calls / imports";
  const empty = column.cards.length === 0 && column.pills.length === 0;

  // For a decl subject, sort so same-file cards are contiguous, then render a
  // file header at each group boundary.
  const cards = grouped
    ? [...column.cards].sort(
        (a, b) => (a.fileId < b.fileId ? -1 : a.fileId > b.fileId ? 1 : 0) || b.count - a.count,
      )
    : column.cards;

  let lastFile: string | null = null;
  return (
    <div className={`fg-col fg-col-${column.direction}`}>
      <div className="fg-col-head">
        <span className="fg-col-title">{title}</span>
        <span className="fg-col-sub">{subtitle}</span>
      </div>
      {empty ? <div className="fg-empty">No observed connections.</div> : null}
      <ul className="fg-card-list">
        {cards.map((c) => {
          const showHeader = grouped && c.fileId !== lastFile;
          lastFile = c.fileId;
          return (
            <Card
              key={c.id}
              c={c}
              orientation={column.direction}
              showFileHeader={showHeader}
              onReroot={onReroot}
              registerNav={registerNav}
            />
          );
        })}
      </ul>
      <PillList pills={column.pills} onReroot={onReroot} registerNav={registerNav} />
    </div>
  );
}

export interface FocusGraphProps {
  model: AtlasModel;
  /** Node id to root the view on (a file or decl). */
  rootId: string;
  /** Ids lit for the current Change Trace (marks cards/pills). */
  litIds?: ReadonlySet<string>;
  /** Dismiss the overlay (Esc at the root / close button / backdrop). */
  onClose: () => void;
  /** Close the overlay and reveal the current subject on the atlas. */
  onOpenOnMap: (id: string) => void;
}

export function FocusGraph({ model, rootId, litIds, onClose, onOpenOnMap }: FocusGraphProps) {
  const [trail, setTrail] = useState<string[]>([rootId]);
  useEffect(() => {
    setTrail([rootId]);
  }, [rootId]);

  const subjectId = trail[trail.length - 1] ?? rootId;
  const focus = useMemo(() => buildFocusModel(model, subjectId, litIds), [model, subjectId, litIds]);

  // Cycle-safe re-root: revisiting a node already on the trail truncates forward
  // history back to it (never grows an unbounded A→B→A→B… breadcrumb).
  const reroot = useCallback((id: string) => {
    setTrail((t) => {
      const existing = t.indexOf(id);
      if (existing !== -1) return existing === t.length - 1 ? t : t.slice(0, existing + 1);
      return [...t, id];
    });
  }, []);
  const back = useCallback(() => {
    setTrail((t) => (t.length > 1 ? t.slice(0, -1) : t));
  }, []);

  // Keyboard focus among the clickable cards/pills (store-absent pills are not
  // focusable — they cannot re-root). Arrow keys move focus, Enter re-roots.
  const navEntries = useMemo(() => {
    if (!focus) return { inbound: [] as string[], outbound: [] as string[] };
    const clickable = (col: FocusColumn) => [
      ...col.cards.map((c) => c.id),
      ...col.pills.filter((p) => !p.notInIndex).map((p) => p.id),
    ];
    return { inbound: clickable(focus.inbound), outbound: clickable(focus.outbound) };
  }, [focus]);
  const [nav, setNav] = useState<{ col: "inbound" | "outbound"; idx: number } | null>(null);
  useEffect(() => {
    setNav(null);
  }, [subjectId]);
  const navRegRef = useRef(new Map<string, HTMLButtonElement>());
  const registerNav = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) navRegRef.current.set(id, el);
    else navRegRef.current.delete(id);
  }, []);
  // Move real DOM focus to the entry the arrow keys land on (focus ring visible).
  useEffect(() => {
    if (!nav) return;
    const key = navEntries[nav.col]?.[nav.idx];
    if (key) navRegRef.current.get(key)?.focus();
  }, [nav, navEntries]);

  // Own the Escape key while open: pop a hop, else dismiss. SpikeApp's global
  // Esc handler yields whenever the overlay is mounted.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setTrail((t) => {
        if (t.length > 1) return t.slice(0, -1);
        onClose();
        return t;
      });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Arrow / Enter / Backspace navigation (Esc is owned by the capture handler
  // above). Arrows move card focus within a column (Up/Down) and between columns
  // (Left = inbound, Right = outbound); Enter re-roots the focused entry;
  // Backspace pops the breadcrumb.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      const cols = navEntries;
      const firstNonEmpty = (): "inbound" | "outbound" | null =>
        cols.inbound.length ? "inbound" : cols.outbound.length ? "outbound" : null;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const col = nav && cols[nav.col].length ? nav.col : firstNonEmpty();
        if (!col) return;
        e.preventDefault();
        if (!nav || nav.col !== col) {
          setNav({ col, idx: 0 });
          return;
        }
        const len = cols[col].length;
        const idx =
          e.key === "ArrowDown" ? Math.min(len - 1, nav.idx + 1) : Math.max(0, nav.idx - 1);
        setNav({ col, idx });
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        const want = e.key === "ArrowRight" ? "outbound" : "inbound";
        const col = cols[want].length ? want : firstNonEmpty();
        if (!col) return;
        e.preventDefault();
        const idx = Math.min(cols[col].length - 1, Math.max(0, nav?.idx ?? 0));
        setNav({ col, idx });
      } else if (e.key === "Enter") {
        if (!nav) return;
        const key = cols[nav.col]?.[nav.idx];
        if (key) {
          e.preventDefault();
          reroot(key);
        }
      } else if (e.key === "Backspace") {
        e.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [nav, navEntries, reroot, back]);

  if (!focus) return null;
  const s = focus.subject;
  const grouped = focus.subjectKind === "decl";

  return (
    <div className="focus-graph-overlay">
      <div className="fg-backdrop" onClick={onClose} aria-hidden="true" />
      <section className="focus-graph" role="dialog" aria-label="Connections view" aria-modal="true">
        <header className="fg-header">
          <nav className="fg-breadcrumb" aria-label="focus trail">
            {trail.map((id, i) => {
              const n = model.nodeIndex.get(id);
              const isLast = i === trail.length - 1;
              return (
                <span key={`${id}:${i}`} className="fg-crumb">
                  {i > 0 ? <span className="fg-crumb-sep">/</span> : null}
                  <button
                    type="button"
                    className={`fg-crumb-btn${isLast ? " fg-crumb-current" : ""}`}
                    disabled={isLast}
                    onClick={() => setTrail(trail.slice(0, i + 1))}
                  >
                    {n?.name ?? id}
                  </button>
                </span>
              );
            })}
          </nav>
          <div className="fg-header-actions">
            {trail.length > 1 ? (
              <button type="button" className="fg-back" onClick={back}>
                ← Back
              </button>
            ) : null}
            <button type="button" className="fg-open-map" onClick={() => onOpenOnMap(subjectId)}>
              Open on map
            </button>
            <button type="button" className="fg-close" aria-label="Close connections view" onClick={onClose}>
              ×
            </button>
          </div>
        </header>

        <div className="fg-columns">
          <Column
            column={focus.inbound}
            grouped={grouped}
            onReroot={reroot}
            registerNav={registerNav}
          />

          <div className="fg-col fg-col-center">
            <div className="fg-subject">
              <span className="fg-badge fg-badge-subject">
                {s.kind === "decl" ? `decl · ${s.symbolKind ?? "symbol"}` : "file"}
              </span>
              <div className="fg-subject-name">{s.name}</div>
              <div className="fg-subject-path mono">{s.path}</div>
              <div className="fg-subject-meta">
                <StatusTick status={s.status} />
                <LitTick lit={litIds?.has(s.id) ?? false} />
                {focus.subjectKind === "file" ? (
                  <span className="fg-subject-decls">
                    {focus.declCount} {focus.declCount === 1 ? "declaration" : "declarations"}
                  </span>
                ) : null}
              </div>
              <div className="fg-subject-pkg mono">package {focus.package || "(root)"}</div>
            </div>

            {!focus.hasConnections ? (
              <div className="fg-zero">
                <div className="fg-zero-line">No observed calls or imports</div>
                {focus.subjectDecls.length > 0 ? (
                  <div className="fg-zero-decls">
                    <div className="fg-zero-decls-title">
                      Declared here ({focus.subjectDecls.length})
                    </div>
                    <ul className="fg-zero-decl-list">
                      {focus.subjectDecls.map((d) => (
                        <li key={d.id} className="fg-zero-decl mono">
                          <span className="fg-zero-decl-name">{d.name}</span>
                          <span className="fg-zero-decl-kind">{d.symbolKind ?? "decl"}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <Column
            column={focus.outbound}
            grouped={grouped}
            onReroot={reroot}
            registerNav={registerNav}
          />
        </div>
      </section>
    </div>
  );
}
