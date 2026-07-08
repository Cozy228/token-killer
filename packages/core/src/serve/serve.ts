/**
 * Serving surface (CONTEXA-IMPL §7, slice 1g) — the three MCP tools as LIBRARY
 * calls. The `ctx mcp` CLI subcommand is a thin stdio JSON-RPC shim over these
 * (§1: ~50-line shim; all logic here).
 *
 *   context({ ref?, task?, handle?, budget? })  — refresh → select → render
 *   search({ query, kinds? })                   — refresh → search → render
 *   remember({ note, anchors?, supersedes? })   — write via memory/remember
 *
 * Error taxonomy (§7 / P28): recoverable conditions (not-indexed, ref-not-found,
 * ambiguous, empty-store, no-input, budget-degraded, read-through failure) are
 * SUCCESS-SHAPED guidance (isError=false); real `isError` is reserved for
 * malformed arguments and store corruption. `assertNoEgress()` (M14) guards
 * every entry point — a present model key is a hard refusal, not a serve.
 */
import type { Store } from "../store/store.ts";
import type { RefreshReport } from "../ingest/refresh.ts";
import { search, select } from "../select/engine.ts";
import type { BudgetTier, FacetResult, SelectMiss, SelectResult } from "../select/types.ts";
import type { Entity, EntityKind } from "../store/types.ts";
import { remember, type RememberResult } from "../memory/remember.ts";
import { MemoryFiles } from "../memory/fileStore.ts";
import { assertNoEgress } from "./egress.ts";
import {
  freshnessLabel,
  renderAmbiguous,
  renderContext,
  renderFacet,
  renderMiss,
  renderSearch,
  type RenderOut,
} from "./render.ts";
import {
  MAX_RESPONSE_CHARS,
  type ServeDeps,
  type ServeDiag,
  type ServeKind,
  type ServeResponse,
} from "./types.ts";

/** Default serve-path refresh budget (§4.1 time-boxed catch-up gate is 3s). */
export const SERVE_BUDGET_MS = 3_000;

export interface ContextArgs {
  ref?: string;
  task?: string;
  handle?: string;
  budget?: BudgetTier;
}
export interface SearchArgs {
  query?: string;
  kinds?: EntityKind[];
}
export interface RememberArgs {
  note?: string;
  detail?: string;
  anchors?: string[];
  supersedes?: string;
}

// ---- response builders ----

/** Enforce the ≤24K-char hard ceiling (§7 / G-1): a rendered block that would
 *  force a host file-externalization is cut at a line boundary + disclosed. */
function capText(text: string): string {
  if (text.length <= MAX_RESPONSE_CHARS) return text;
  const note = "\n`truncated`: response hit the 24K-char ceiling — drill a [handle] for the rest";
  const room = MAX_RESPONSE_CHARS - note.length;
  const cut = text.lastIndexOf("\n", room);
  return text.slice(0, cut > 0 ? cut : room) + note;
}

function build(kind: ServeKind, out: RenderOut, extra: Partial<ServeDiag>): ServeResponse {
  const diag: ServeDiag = {
    recoverable: extra.recoverable ?? false,
    sectionOrder: out.sectionOrder,
    renderedHandles: [...new Set(out.handles)],
    ...(extra.envelope !== undefined ? { envelope: extra.envelope } : {}),
    ...(extra.sections !== undefined ? { sections: extra.sections } : {}),
    ...(extra.search !== undefined ? { search: extra.search } : {}),
    ...(extra.freshness !== undefined ? { freshness: extra.freshness } : {}),
  };
  return { kind, text: capText(out.text), isError: false, diag };
}

/** Malformed arguments (§7 taxonomy): one of the two real `isError` cases. */
function malformed(kind: ServeKind, message: string): ServeResponse {
  return {
    kind,
    text: `# ctx · ${kind} — error\nmalformed arguments: ${message}`,
    isError: true,
    diag: { recoverable: false, sectionOrder: [], renderedHandles: [] },
  };
}

/** Store corruption / unexpected fault (§7 taxonomy): the other real `isError`. */
function corruption(kind: ServeKind, err: unknown): ServeResponse {
  const message = err instanceof Error ? err.message : String(err);
  return {
    kind,
    text: `# ctx · ${kind} — error\nstore fault: ${message}`,
    isError: true,
    diag: { recoverable: false, sectionOrder: [], renderedHandles: [] },
  };
}

function isOptString(v: unknown): v is string | undefined {
  return v === undefined || typeof v === "string";
}

// ---- context() ----

function finishSelect(
  result: SelectResult | SelectMiss | FacetResult,
  freshLabel: string,
  freshness: RefreshReport | undefined,
  subject: string,
): ServeResponse {
  if (result.ok === false) {
    return build("context", renderMiss(subject, result, freshLabel), {
      recoverable: true,
      ...(freshness !== undefined ? { freshness } : {}),
    });
  }
  if (result.mode === "facet") {
    return build(
      "context",
      renderFacet(result, freshLabel),
      freshness !== undefined ? { freshness } : {},
    );
  }
  return build("context", renderContext(result, freshLabel), {
    envelope: result.envelope,
    sections: result.sections,
    ...(freshness !== undefined ? { freshness } : {}),
  });
}

/** First non-empty read-through line of an entity, for ambiguous-candidate
 *  `N⇥` rendering. Read-through failure → the entity name (recoverable). */
function firstDefLine(store: Store, entity: Entity): { defLine: string; startLine: number } {
  const startLine = entity.locator.t === "file" && entity.locator.span ? entity.locator.span[0] : 1;
  const rt = store.readThrough(entity.id);
  if (!rt.ok) return { defLine: entity.name, startLine };
  const line = rt.text.split("\n").find((l) => l.trim().length > 0);
  return { defLine: line ?? entity.name, startLine };
}

function serveRef(
  store: Store,
  ref: string,
  budget: BudgetTier | undefined,
  now: (() => number) | undefined,
  freshLabel: string,
  freshness: RefreshReport | undefined,
): ServeResponse {
  const opts = {
    ...(budget !== undefined ? { budget } : {}),
    ...(now !== undefined ? { now } : {}),
  };
  // Resolvable handle / entity id → straight select.
  const resolved = store.resolveHandle(ref);
  if (resolved && store.getEntity(resolved.entityId)) {
    return finishSelect(select(store, { ref, ...opts }), freshLabel, freshness, ref);
  }
  // Name lookup: ambiguous → ALL candidate definitions in ONE response (§7).
  const byName = store.entitiesByName(ref);
  if (byName.length > 1) {
    const candidates = byName.map((entity) => ({
      entity,
      handle: store.internHandle(entity.id),
      ...firstDefLine(store, entity),
    }));
    return build("context", renderAmbiguous(ref, candidates, freshLabel), {
      recoverable: true,
      ...(freshness !== undefined ? { freshness } : {}),
    });
  }
  if (byName.length === 1) {
    return finishSelect(select(store, { ref: byName[0]!.id, ...opts }), freshLabel, freshness, ref);
  }
  // Unknown ref → select() returns a success-shaped miss with FTS candidates.
  return finishSelect(select(store, { ref, ...opts }), freshLabel, freshness, ref);
}

export async function serveContext(deps: ServeDeps, args: ContextArgs): Promise<ServeResponse> {
  assertNoEgress(deps.env ?? process.env); // hard refusal (M14) — never a serve
  if (args.budget !== undefined && args.budget !== "lean" && args.budget !== "wide") {
    return malformed(
      "context",
      `budget must be "lean" or "wide" (got ${JSON.stringify(args.budget)})`,
    );
  }
  if (!isOptString(args.ref) || !isOptString(args.task) || !isOptString(args.handle)) {
    return malformed("context", "ref, task and handle must be strings when present");
  }
  try {
    const freshness = deps.refresh
      ? await deps.refresh(deps.serveBudgetMs ?? SERVE_BUDGET_MS)
      : undefined;
    const freshLabel = freshnessLabel(freshness);
    const store = deps.store;
    const opts = {
      ...(args.budget !== undefined ? { budget: args.budget } : {}),
      ...(deps.now !== undefined ? { now: deps.now } : {}),
    };
    if (args.handle !== undefined) {
      return finishSelect(
        select(store, { handle: args.handle, ...opts }),
        freshLabel,
        freshness,
        args.handle,
      );
    }
    if (args.ref !== undefined) {
      return serveRef(store, args.ref, args.budget, deps.now, freshLabel, freshness);
    }
    if (args.task !== undefined && args.task.trim().length > 0) {
      return finishSelect(
        select(store, { task: args.task, ...opts }),
        freshLabel,
        freshness,
        args.task,
      );
    }
    // No input → success-shaped guidance (recoverable; select() owns the text).
    return finishSelect(select(store, opts), freshLabel, freshness, "context");
  } catch (err) {
    return corruption("context", err);
  }
}

// ---- search() ----

export async function serveSearch(deps: ServeDeps, args: SearchArgs): Promise<ServeResponse> {
  assertNoEgress(deps.env ?? process.env);
  if (typeof args.query !== "string") {
    return malformed("search", "query is required and must be a string");
  }
  if (
    args.kinds !== undefined &&
    (!Array.isArray(args.kinds) || args.kinds.some((k) => typeof k !== "string"))
  ) {
    return malformed("search", "kinds must be an array of entity-kind strings");
  }
  try {
    const freshness = deps.refresh
      ? await deps.refresh(deps.serveBudgetMs ?? SERVE_BUDGET_MS)
      : undefined;
    const freshLabel = freshnessLabel(freshness);
    if (args.query.trim().length === 0) {
      // Recoverable: empty query → success-shaped guidance, never isError.
      return build(
        "search",
        {
          text: `# ctx · search — ${freshLabel}\nProvide a non-empty query. Example: \`search({ query: "retry idempotency" })\`.`,
          handles: [],
          sectionOrder: [],
        },
        { recoverable: true, ...(freshness !== undefined ? { freshness } : {}) },
      );
    }
    const result = search(deps.store, {
      query: args.query,
      ...(args.kinds !== undefined ? { kinds: args.kinds } : {}),
      ...(deps.now !== undefined ? { now: deps.now } : {}),
    });
    return build("search", renderSearch(result, freshLabel), {
      search: result,
      ...(freshness !== undefined ? { freshness } : {}),
    });
  } catch (err) {
    return corruption("search", err);
  }
}

// ---- remember() ----

function renderRemember(result: RememberResult): RenderOut {
  if (result.ok) {
    // S8a: an MCP (agent) note lands in the personal overlay as `needs-review`
    // (a human confirms it into the shared committed log). Disclose the landing.
    const heading = result.status === "active" ? "saved" : `saved · ${result.status}`;
    const parts = [
      `# ctx · remember — ${heading}`,
      `remembered [${result.handle}] — ${result.gist}`,
    ];
    if (result.anchors.length > 0) parts.push(`anchors: ${result.anchors.join(", ")}`);
    if (result.supersededId) parts.push(`supersedes: ${result.supersededId}`);
    if (result.status === "needs-review") {
      parts.push(
        "landed as needs-review in your local overlay — `ctx memory confirm` to share it.",
      );
    }
    if (result.remediation) parts.push(result.remediation);
    return { text: parts.join("\n"), handles: [result.handle], sectionOrder: [] };
  }
  const handles: string[] = [];
  const parts = [`# ctx · remember — ${result.reason}`, result.guidance];
  if (result.candidates) {
    for (const [anchor, cands] of Object.entries(result.candidates)) {
      parts.push(`**\`${anchor}\`**`);
      for (const c of cands) {
        parts.push(`${c.kind} ${c.name} [${c.handle}]`);
        handles.push(c.handle);
      }
    }
  }
  return { text: parts.join("\n"), handles, sectionOrder: [] };
}

export function serveRemember(deps: ServeDeps, args: RememberArgs): ServeResponse {
  assertNoEgress(deps.env ?? process.env);
  if (typeof args.note !== "string") {
    return malformed("remember", "note is required and must be a string");
  }
  if (
    args.anchors !== undefined &&
    (!Array.isArray(args.anchors) || args.anchors.some((a) => typeof a !== "string"))
  ) {
    return malformed("remember", "anchors must be an array of strings");
  }
  if (args.supersedes !== undefined && typeof args.supersedes !== "string") {
    return malformed("remember", "supersedes must be a string");
  }
  if (args.note.trim().length === 0) {
    return build(
      "remember",
      {
        text: "# ctx · remember — empty\nProvide a non-empty note to remember.",
        handles: [],
        sectionOrder: [],
      },
      { recoverable: true },
    );
  }
  try {
    const result = remember(deps.store, {
      note: args.note,
      ...(args.detail !== undefined ? { detail: args.detail } : {}),
      ...(args.anchors !== undefined ? { anchors: args.anchors } : {}),
      ...(args.supersedes !== undefined ? { supersedes: args.supersedes } : {}),
      // S8a: the MCP tool is the AGENT surface → overlay `needs-review`. Write-
      // through is always-on (slice 4): the note lands in the personal overlay
      // file + the index. E4 secret guard runs before any committed write.
      surface: "mcp",
      files: MemoryFiles.forStore(deps.store),
    });
    return build("remember", renderRemember(result), { recoverable: !result.ok });
  } catch (err) {
    return corruption("remember", err);
  }
}
