/**
 * Serving-surface types (CTX-IMPL §7, slice 1g). The three MCP tools return a
 * `ServeResponse`: ONE markdown text block (`text`) plus the `isError` flag the
 * host sees, and an internal `diag` struct the shared invariant helpers assert
 * on (G-1..G-7). `diag` is NEVER serialized to the host — the host gets `text`.
 */
import type { Store } from "../store/store.ts";
import type { RefreshReport } from "../ingest/refresh.ts";
import type {
  SearchResult,
  SectionName,
  SectionResult,
  SelectionEnvelope,
} from "../select/types.ts";

/** Hard ceiling on any single inline response (§7): above ~25K some hosts
 *  externalize the result to a file and force the Read-back we exist to avoid. */
export const MAX_RESPONSE_CHARS = 24_000;

/** How many omitted items per section carry an explicit drill handle in the
 *  rendered `omitted` block (bounded for token economy; the count is exact). */
export const OMITTED_HANDLES_PER_SECTION = 6;

export interface ServeDeps {
  store: Store;
  /** Refresh-before-select (§4.1): run over the serve budget, report freshness.
   *  Omitted in pure-render/deterministic tiers → header reports `fresh`. */
  refresh?: (budgetMs: number) => Promise<RefreshReport>;
  /** Serve budget for the refresh gate (default {@link SERVE_BUDGET_MS}). */
  serveBudgetMs?: number;
  /** Injected clock for selection decay/handles (fixed-clock tests, §10). */
  now?: () => number;
  /** Env the egress guard inspects (default process.env; tests inject). */
  env?: NodeJS.ProcessEnv;
}

export type ServeKind = "context" | "search" | "remember";

/**
 * Diagnostics for the shared invariant helpers (G-1..G-7). Present fields depend
 * on the response kind; helpers assert only on what applies.
 */
export interface ServeDiag {
  /** True when this response answers a RECOVERABLE condition (§7): it MUST be
   *  success-shaped (isError=false) — G-3. */
  recoverable: boolean;
  /** Section order as rendered (context select only) — G-4. */
  sectionOrder: SectionName[];
  /** Every handle rendered anywhere in `text` — G-5 round-trip set. */
  renderedHandles: string[];
  /** Selection envelope (context select) — G-1/G-2 struct-level checks. */
  envelope?: SelectionEnvelope;
  /** Section structs (context select) — G-2 omission reconciliation. */
  sections?: SectionResult[];
  /** Search struct (search) — G-2 reconciliation on the flat list. */
  search?: SearchResult;
  /** Freshness the header reported (context/search). */
  freshness?: RefreshReport;
}

export interface ServeResponse {
  kind: ServeKind;
  /** ONE markdown text block — exactly what the host tool result carries. */
  text: string;
  /** §7 taxonomy: true ONLY for malformed arguments / store corruption. */
  isError: boolean;
  diag: ServeDiag;
}
