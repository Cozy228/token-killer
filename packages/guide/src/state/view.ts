/**
 * VIEW state only (D1): selection, canvas mode, drawers, navigation history, the dev HUD.
 *
 * No projection, no store fact, no derived count lives here. Everything the user sees about
 * the repository comes from the `GuideDataSource`; this store remembers only what the USER
 * has done to the view. That boundary is why a reload cannot invent a different repo.
 */
import { create } from "zustand";

/** D27's four modes. Only `overview` is implemented in this slice; G/C/T land the rest. */
export type CanvasMode = "overview" | "scope" | "connections" | "event";

export type SelectionSource = "canvas" | "tree" | "omnibox";

export interface HistoryEntry {
  id: string;
  label: string;
  source: SelectionSource;
}

export interface ViewState {
  mode: CanvasMode;
  selectedId: string | undefined;
  selectedFrom: SelectionSource | undefined;
  /** Most recent first, de-duplicated, capped. The rail's navigation history (D28). */
  history: readonly HistoryEntry[];
  /** Directory rows the user has opened. Explicit — never a zoom threshold (D27). */
  expanded: ReadonlySet<string>;
  /** <1100px: the rail and the inspector become drawers (D13/D28). */
  railOpen: boolean;
  inspectorOpen: boolean;
  /** Perf HUD. Dev flag only — never on the product surface (D28). */
  hud: boolean;

  select: (id: string, from: SelectionSource, label?: string) => void;
  clearSelection: () => void;
  toggleExpanded: (id: string) => void;
  setRailOpen: (open: boolean) => void;
  setInspectorOpen: (open: boolean) => void;
  setHud: (on: boolean) => void;
}

const HISTORY_MAX = 12;

export const useView = create<ViewState>((set) => ({
  mode: "overview",
  selectedId: undefined,
  selectedFrom: undefined,
  history: [],
  expanded: new Set<string>(),
  railOpen: false,
  inspectorOpen: false,
  hud: hudFlag(),

  select: (id, from, label) =>
    set((state) => {
      const entry: HistoryEntry = { id, label: label ?? id, source: from };
      const rest = state.history.filter((h) => h.id !== id);
      return {
        selectedId: id,
        selectedFrom: from,
        history: [entry, ...rest].slice(0, HISTORY_MAX),
      };
    }),

  clearSelection: () => set({ selectedId: undefined, selectedFrom: undefined }),

  toggleExpanded: (id) =>
    set((state) => {
      const next = new Set(state.expanded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { expanded: next };
    }),

  setRailOpen: (railOpen) => set({ railOpen }),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),
  setHud: (hud) => set({ hud }),
}));

/**
 * The HUD is opt-in and leaves no trace on the product surface: `#/?hud=1` in the hash, or
 * `?hud=1` in the query. There is no button for it, because D28 removed it from the product.
 */
function hudFlag(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash;
  const query = window.location.search;
  return /[?&]hud=1\b/.test(hash) || /[?&]hud=1\b/.test(query);
}
