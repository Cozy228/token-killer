/**
 * Command palette (P40 R15 J2 — "find"). Search-first entry over ALL entity kinds,
 * backed by the store's FTS (via `buildSearchProjection`). ⌘K opens it from
 * anywhere. Kind-filter chips, keyboard nav (↑/↓/↵), each hit opens its subject.
 * This is the fix for the v2 "dead search": typing a real symbol returns hits.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import type { EntityKind, SearchProjection } from "@contexa/core";
import { getSearch } from "../api.ts";
import { navigate } from "../router.ts";
import { EnvelopeChip } from "./EnvelopeChip.tsx";
import { useApp } from "../appContext.ts";

/** Kinds offered as filter chips (the seven the order names as searchable). Bundling
 *  the core runtime list is banned (types-only import), so it's declared locally. */
const KIND_CHIPS: EntityKind[] = [
  "symbol",
  "file",
  "doc_section",
  "commit",
  "decision",
  "memory",
  "concept",
];

export function CommandPalette({ onClose }: { onClose: () => void }): React.ReactElement {
  const { openEvidence } = useApp();
  const [query, setQuery] = useState("");
  const [kinds, setKinds] = useState<Set<EntityKind>>(new Set());
  const [result, setResult] = useState<SearchProjection | undefined>(undefined);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced FTS query.
  const kindKey = useMemo(() => [...kinds].sort().join(","), [kinds]);
  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setResult(undefined);
      return;
    }
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      const kindArr = kinds.size > 0 ? [...kinds] : null;
      getSearch(q, kindArr).then(
        (r) => {
          if (!alive) return;
          setResult(r);
          setActive(0);
          setLoading(false);
        },
        () => alive && setLoading(false),
      );
    }, 140);
    return () => {
      alive = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, kindKey]);

  const hits = result?.hits ?? [];

  const go = (ref: string): void => {
    navigate({ view: "subject", ref });
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && hits[active]) {
      e.preventDefault();
      go(hits[active]!.entityId);
    }
  };

  const toggleKind = (k: EntityKind): void => {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  };

  return (
    <div className="palette-scrim" onClick={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-label="Search"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="search-row">
          <MagnifyingGlass size={18} weight="bold" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search symbols, files, docs, commits, decisions, memory, concepts…"
            aria-label="Search query"
          />
        </div>
        <div className="kinds">
          {KIND_CHIPS.map((k) => (
            <button
              key={k}
              type="button"
              className="kchip"
              aria-pressed={kinds.has(k)}
              onClick={() => toggleKind(k)}
            >
              {k}
            </button>
          ))}
        </div>
        <div className="results">
          {hits.map((h, i) => (
            <button
              key={h.entityId}
              type="button"
              className="result"
              data-active={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(h.entityId)}
            >
              <span className="kind">{h.kind}</span>
              <span className="rname">{h.name}</span>
              <span onClick={(e) => e.stopPropagation()}>
                <EnvelopeChip evidence={h.evidence} onOpenEvidence={openEvidence} />
              </span>
            </button>
          ))}
          {query.trim() && !loading && hits.length === 0 && (
            <p className="noresult">No entities match "{query}".</p>
          )}
          {result && result.budget.omitted > 0 && (
            <p className="omit-note">
              +{result.budget.omitted} more beyond the {result.budget.budget.nodeCap} shown
            </p>
          )}
        </div>
        <div className="foot">
          <span>
            <kbd>↑</kbd> <kbd>↓</kbd> navigate
          </span>
          <span>
            <kbd>↵</kbd> open subject
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
