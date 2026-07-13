// Perf recorder for the D12 budget gate. Exposes window.__GUIDE_PERF__ so an
// external driver (Playwright / manual) can read live numbers, and provides a
// testable core with an injectable clock.

export interface ActionSample {
  kind: "expand" | "search";
  ms: number;
  at: number;
}

export interface PerfRecord {
  projectionAvailable: number | null;
  firstInteractive: number | null;
  compileMs: number | null;
  sliceMs: number | null;
  expand: ActionSample[];
  search: ActionSample[];
  panZoomFps: number[];
  longTasks: number[];
  jsonBytes: number | null;
  logicalNodes: number | null;
  visibleNodes: number | null;
  logicalEdges: number | null;
  visibleEdges: number | null;
  /** Diagnostic notes (e.g. firstInteractive deferred because the tab was hidden). */
  notes: string[];
}

export interface PerfRecorder {
  record: PerfRecord;
  markProjectionAvailable(): void;
  markFirstInteractive(): void;
  setCompileMs(ms: number): void;
  setSliceMs(ms: number): void;
  setCounts(c: {
    logicalNodes: number;
    visibleNodes: number;
    logicalEdges: number;
    visibleEdges: number;
  }): void;
  setJsonBytes(n: number): void;
  measureAction<T>(kind: "expand" | "search", fn: () => T): T;
  recordFps(fps: number): void;
  /** Drop stale fps samples so a fresh Sweep measures only its own tour. */
  clearFps(): void;
  recordLongTask(ms: number): void;
  addNote(note: string): void;
}

function emptyRecord(): PerfRecord {
  return {
    projectionAvailable: null,
    firstInteractive: null,
    compileMs: null,
    sliceMs: null,
    expand: [],
    search: [],
    panZoomFps: [],
    longTasks: [],
    jsonBytes: null,
    logicalNodes: null,
    visibleNodes: null,
    logicalEdges: null,
    visibleEdges: null,
    notes: [],
  };
}

export function createPerfRecorder(now: () => number = () => performance.now()): PerfRecorder {
  const record = emptyRecord();
  return {
    record,
    markProjectionAvailable() {
      record.projectionAvailable = now();
    },
    markFirstInteractive() {
      if (record.firstInteractive === null) {
        const base = record.projectionAvailable ?? 0;
        record.firstInteractive = now() - base;
      }
    },
    setCompileMs(ms) {
      record.compileMs = ms;
    },
    setSliceMs(ms) {
      record.sliceMs = ms;
    },
    setCounts(c) {
      record.logicalNodes = c.logicalNodes;
      record.visibleNodes = c.visibleNodes;
      record.logicalEdges = c.logicalEdges;
      record.visibleEdges = c.visibleEdges;
    },
    setJsonBytes(n) {
      record.jsonBytes = n;
    },
    measureAction(kind, fn) {
      const start = now();
      const result = fn();
      const ms = now() - start;
      record[kind].push({ kind, ms, at: start });
      return result;
    },
    recordFps(fps) {
      record.panZoomFps.push(fps);
    },
    clearFps() {
      record.panZoomFps.length = 0;
    },
    recordLongTask(ms) {
      if (ms > 0) record.longTasks.push(ms);
    },
    addNote(note) {
      record.notes.push(note);
    },
  };
}

// D12 budget table (current corpus / 10x corpus), merge-blocking.
export interface Budget {
  firstInteractiveMs: number;
  expandMs: number;
  searchMs: number;
  minFps: number;
  maxLongTaskMs: number;
}
export const BUDGET_CURRENT: Budget = {
  firstInteractiveMs: 1000,
  expandMs: 100,
  searchMs: 75,
  minFps: 50,
  maxLongTaskMs: 500,
};
export const BUDGET_10X: Budget = {
  firstInteractiveMs: 3000,
  expandMs: 250,
  searchMs: 150,
  minFps: 50,
  maxLongTaskMs: 500,
};

function worst(samples: ActionSample[]): number {
  return samples.reduce((m, s) => Math.max(m, s.ms), 0);
}

export interface BudgetCheck {
  label: string;
  measured: number;
  budget: number;
  unit: string;
  pass: boolean;
  higherIsBetter?: boolean;
}

export function evaluateBudget(record: PerfRecord, budget: Budget): BudgetCheck[] {
  const fpsMin = record.panZoomFps.length ? Math.min(...record.panZoomFps) : Number.NaN;
  const longMax = record.longTasks.length ? Math.max(...record.longTasks) : 0;
  return [
    {
      label: "first interactive",
      measured: record.firstInteractive ?? Number.NaN,
      budget: budget.firstInteractiveMs,
      unit: "ms",
      pass:
        record.firstInteractive !== null && record.firstInteractive <= budget.firstInteractiveMs,
    },
    {
      label: "expand (worst)",
      measured: worst(record.expand),
      budget: budget.expandMs,
      unit: "ms",
      pass: record.expand.length > 0 && worst(record.expand) <= budget.expandMs,
    },
    {
      label: "search (worst)",
      measured: worst(record.search),
      budget: budget.searchMs,
      unit: "ms",
      pass: record.search.length > 0 && worst(record.search) <= budget.searchMs,
    },
    {
      label: "pan/zoom (min fps)",
      measured: fpsMin,
      budget: budget.minFps,
      unit: "fps",
      higherIsBetter: true,
      pass: record.panZoomFps.length > 0 && fpsMin >= budget.minFps,
    },
    {
      label: "long task (max)",
      measured: longMax,
      budget: budget.maxLongTaskMs,
      unit: "ms",
      pass: longMax <= budget.maxLongTaskMs,
    },
  ];
}
