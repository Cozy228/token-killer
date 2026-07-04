/**
 * Selection engine orchestration (CTX-IMPL §6, slice 1f): LIBRARY calls only —
 * `select()` and `search()` return typed structs; the MCP tools + markdown
 * envelope render are slice 1g.
 *
 * select(): seeds → subgraph expansion → PPR → post-multipliers → RRF fusion →
 * heat boost → sections + borrowing → projection with render tiers.
 * search(): stages 1–2 + flat ranked render (composite score, no PPR).
 * Facet drill-downs skip PPR and render the facet directly (~800 tokens).
 *
 * Recoverable conditions are RETURN VALUES (SelectMiss), never throws (G-3);
 * 1g shapes them into success-shaped guidance.
 */
import type { Store } from "../store/store.ts";
import type { Entity, Facet } from "../store/types.ts";
import {
  CHARS_PER_TOKEN,
  FACET_BUDGET_TOKENS,
  SEARCH_MAX_RESULTS,
  disclosedConstants,
} from "./constants.ts";
import { estimateTokens, commitMessageOf, renderLineText } from "./project.ts";
import { personalizedPageRank } from "./ppr.ts";
import { heatBoost, postMultiplier, rankOf, rrfFuse } from "./rank.ts";
import { gatherSeeds, refSeed, type SeedStage } from "./seeds.ts";
import { assembleSections, type ConflictCandidate, type RankedCandidate } from "./sections.ts";
import { expandSubgraph } from "./subgraph.ts";
import { snapshotVisibility, type Visibility } from "./visibility.ts";
import { tokenizeQuery } from "./tokenize.ts";
import type {
  FacetResult,
  SearchInput,
  SearchItem,
  SearchResult,
  SelectInput,
  SelectMiss,
  SelectResult,
  OmittedItem,
} from "./types.ts";

interface Ctx {
  store: Store;
  visibility: Visibility;
  now: number;
  entityCache: Map<string, Entity | undefined>;
}

function makeCtx(store: Store, now?: () => number): Ctx {
  return {
    store,
    visibility: snapshotVisibility(store),
    now: (now ?? Date.now)(),
    entityCache: new Map(),
  };
}

function entityOf(ctx: Ctx, id: string): Entity | undefined {
  if (!ctx.entityCache.has(id)) ctx.entityCache.set(id, ctx.store.getEntity(id));
  return ctx.entityCache.get(id);
}

/** Composite ranking shared by select(): PPR × post-multipliers ⨝RRF lexical × heat. */
function rankSelection(ctx: Ctx, stage: SeedStage): RankedCandidate[] {
  const { store } = ctx;
  const subgraph = expandSubgraph(store, stage.seeds, ctx.visibility, (id) => entityOf(ctx, id));
  if (subgraph.nodes.size === 0) return [];

  // PPR over the subgraph, teleport = normalized seed weights.
  const teleport = new Map<string, number>();
  for (const s of stage.seeds) {
    if (subgraph.nodes.has(s.entityId)) teleport.set(s.entityId, s.weight);
  }
  const ppr = personalizedPageRank(
    [...subgraph.nodes.keys()],
    subgraph.edges.map((e) => ({ src: e.src, dst: e.dst, weight: e.confidence })),
    { seeds: teleport },
  );

  // Post-multipliers on the graph side (§6.3).
  const graphScores = new Map<string, number>();
  for (const [id, score] of ppr) {
    const entity = entityOf(ctx, id);
    const node = subgraph.nodes.get(id);
    if (!entity || !node) continue;
    graphScores.set(id, score * postMultiplier(store, entity, node.confidence, ctx.now));
  }

  // RRF fusion of graph rank + raw lexical rank (named seeds lead the lexical list).
  const lexicalRank = stage.seeds
    .slice()
    .sort(
      (a, b) =>
        Number(b.named) - Number(a.named) ||
        b.lexicalScore - a.lexicalScore ||
        (a.entityId < b.entityId ? -1 : 1),
    )
    .map((s) => s.entityId)
    .filter((id) => subgraph.nodes.has(id));
  const fused = rrfFuse([rankOf(graphScores), lexicalRank]);

  // History-heat boost for code kinds; composite always.
  const out: RankedCandidate[] = [];
  for (const [id, score] of fused) {
    const entity = entityOf(ctx, id);
    if (!entity) continue;
    out.push({ entity, score: score * heatBoost(store, entity, ctx.now) });
  }
  out.sort((a, b) => b.score - a.score || (a.entity.id < b.entity.id ? -1 : 1));
  return out;
}

/** Open conflicts whose claims touch a selected entity (answer-relevant, §6.4). */
function conflictCandidates(ctx: Ctx, ranked: RankedCandidate[]): ConflictCandidate[] {
  const scoreOf = new Map(ranked.map((r) => [r.entity.id, r.score]));
  const out: ConflictCandidate[] = [];
  for (const c of ctx.store.conflicts("open")) {
    const a = ctx.store.getClaim(c.a);
    const b = ctx.store.getClaim(c.b);
    if (!a || !b) continue;
    const subjectId = scoreOf.has(a.subject)
      ? a.subject
      : scoreOf.has(b.subject)
        ? b.subject
        : undefined;
    if (subjectId === undefined) continue;
    const subject = entityOf(ctx, subjectId);
    if (!subject) continue;
    const handle = ctx.store.internHandle(subject.id);
    const left = [a.predicate, a.object].filter(Boolean).join(" ");
    const right = [b.predicate, b.object].filter(Boolean).join(" ");
    out.push({
      subject,
      text: `${c.kind}: ${subject.name} — ${left} ↔ ${right} [${handle}]`,
      score: scoreOf.get(subjectId) ?? 0,
    });
  }
  return out;
}

function missUnknownRef(store: Store, input: string): SelectMiss {
  const query = tokenizeQuery(input, store.projectRoot)
    .map((t) => `"${t.text}"`)
    .join(" OR ");
  const candidates: SelectMiss["candidates"] = [];
  if (query.length > 0) {
    for (const hit of store.ftsSearch(query, 5)) {
      const e = store.getEntity(hit.entityId);
      if (!e) continue;
      candidates.push({
        entityId: e.id,
        name: e.name,
        kind: e.kind,
        handle: store.internHandle(e.id),
      });
    }
  }
  return {
    ok: false,
    reason: "unknown-ref",
    guidance: `\`${input}\` does not resolve to a known entity. Pass a [handle] from a previous response, a full entity id, or use task mode.`,
    candidates,
  };
}

export function select(store: Store, input: SelectInput): SelectResult | SelectMiss | FacetResult {
  const ctx = makeCtx(store, input.now);
  const tier = input.budget ?? "lean";

  if (store.entityCount() === 0) {
    return {
      ok: false,
      reason: "empty-store",
      guidance: "The context base is empty — run `ctx sync` to ingest this project first.",
      candidates: [],
    };
  }

  // ---- ref / handle mode ----
  const refInput = input.handle ?? input.ref;
  if (refInput !== undefined) {
    const resolved = store.resolveHandle(refInput);
    const entity = resolved ? entityOf(ctx, resolved.entityId) : undefined;
    if (!resolved || !entity || !ctx.visibility.isVisible(entity)) {
      return missUnknownRef(store, refInput);
    }
    if (resolved.facet !== undefined) {
      return renderFacet(ctx, entity, resolved.facet); // skips PPR (§6)
    }
    const stage = refSeed(entity.id);
    const ranked = rankSelection(ctx, stage);
    const { sections, envelope } = assembleSections(
      store,
      entity,
      ranked,
      conflictCandidates(ctx, ranked),
      tier,
    );
    const subjectItem = sections.find((s) => s.name === "subject")?.items[0];
    return {
      ok: true,
      mode: input.handle !== undefined ? "handle" : "ref",
      subject: subjectItem,
      sections,
      envelope,
    };
  }

  // ---- task mode ----
  const task = input.task?.trim() ?? "";
  if (task.length === 0) {
    return {
      ok: false,
      reason: "no-input",
      guidance: "Pass one of: task (natural language), ref (entity id), or handle.",
      candidates: [],
    };
  }
  const stage = gatherSeeds(store, task, ctx.visibility);
  if (stage.seeds.length === 0) return missUnknownRef(store, task);
  const ranked = rankSelection(ctx, stage);
  const subject = ranked.length > 0 ? ranked[0]!.entity : undefined;
  const { sections, envelope } = assembleSections(
    store,
    subject,
    ranked,
    conflictCandidates(ctx, ranked),
    tier,
  );
  const subjectItem = sections.find((s) => s.name === "subject")?.items[0];
  return { ok: true, mode: "task", subject: subjectItem, sections, envelope };
}

/**
 * search() = stages 1–2 + flat ranked render (§6). No PPR; composite score =
 * lexical/frontier score × post-multipliers × heat (ranking is never
 * single-metric). Named seeds are force-included past every cutoff.
 */
export function search(store: Store, input: SearchInput): SearchResult {
  const ctx = makeCtx(store, input.now);
  const stage = gatherSeeds(store, input.query, ctx.visibility);
  const subgraph = expandSubgraph(store, stage.seeds, ctx.visibility, (id) => entityOf(ctx, id));

  const seedById = new Map(stage.seeds.map((s) => [s.entityId, s]));
  const kindFilter = input.kinds ? new Set(input.kinds) : undefined;

  interface Scored {
    entity: Entity;
    score: number;
    named: boolean;
    hop: 0 | 1 | 2;
  }
  const scored: Scored[] = [];
  for (const node of subgraph.nodes.values()) {
    const entity = entityOf(ctx, node.entityId);
    if (!entity) continue;
    if (kindFilter && !kindFilter.has(entity.kind)) continue;
    const seed = seedById.get(node.entityId);
    const base = seed ? seed.lexicalScore : node.priority;
    const score =
      base *
      postMultiplier(store, entity, node.confidence, ctx.now) *
      heatBoost(store, entity, ctx.now);
    scored.push({ entity, score, named: seed?.named === true, hop: node.depth });
  }
  scored.sort((a, b) => b.score - a.score || (a.entity.id < b.entity.id ? -1 : 1));

  // Render cap with named-seed force-inclusion: a named entity is never cut.
  const rendered: Scored[] = scored.slice(0, SEARCH_MAX_RESULTS);
  const renderedIds = new Set(rendered.map((s) => s.entity.id));
  for (const s of scored.slice(SEARCH_MAX_RESULTS)) {
    if (!s.named) continue;
    // evict the lowest non-named item to keep the cap
    for (let i = rendered.length - 1; i >= 0; i--) {
      if (!rendered[i]!.named) {
        renderedIds.delete(rendered[i]!.entity.id);
        rendered.splice(i, 1);
        break;
      }
    }
    rendered.push(s);
    renderedIds.add(s.entity.id);
  }

  const items: SearchItem[] = rendered.map((s) => {
    const handle = store.internHandle(s.entity.id);
    const line = renderLineText(s.entity, handle);
    const loc = s.entity.locator;
    return {
      entityId: s.entity.id,
      kind: s.entity.kind,
      name: s.entity.name,
      handle,
      score: s.score,
      named: s.named,
      hop: s.hop,
      line,
      tokens: estimateTokens(line),
      ...(loc.t === "file"
        ? { locator: loc.span ? `${loc.path}:${loc.span[0]}-${loc.span[1]}` : loc.path }
        : {}),
    };
  });

  const omitted: OmittedItem[] = scored
    .filter((s) => !renderedIds.has(s.entity.id))
    .map((s) => ({
      entityId: s.entity.id,
      kind: s.entity.kind,
      name: s.entity.name,
      handle: store.internHandle(s.entity.id),
      score: s.score,
      section: "subject" as const, // flat render: no sections; field kept for the shared struct
    }));

  return {
    ok: true,
    query: input.query,
    items,
    omitted,
    considered: scored.length,
    truncated: omitted.length > 0,
    constants: disclosedConstants(),
  };
}

/** Facet drill-down: skip PPR, render the facet directly (~800-token budget, §6). */
function renderFacet(ctx: Ctx, entity: Entity, facet: Facet): FacetResult {
  const { store } = ctx;
  const handle = store.internHandle(entity.id, facet);
  const notes: string[] = [];
  let text = "";
  let truncated = false;
  let partial = false;

  switch (facet) {
    case "text":
    case "full": {
      const rt = store.readThrough(entity.id);
      if (!rt.ok) {
        partial = true;
        notes.push(`read-through failed: ${rt.message}`);
        break;
      }
      const body = entity.kind === "commit" ? commitMessageOf(rt.text) : rt.text;
      ({ text, truncated } = cutAtBoundary(body, FACET_BUDGET_TOKENS));
      break;
    }
    case "detail": {
      const mem = store.getMemory(entity.id);
      if (!mem) {
        partial = true;
        notes.push(`no memory row for ${entity.id}`);
        break;
      }
      ({ text, truncated } = cutAtBoundary(
        mem.detail ? `${mem.gist}\n\n${mem.detail}` : mem.gist,
        FACET_BUDGET_TOKENS,
      ));
      break;
    }
    case "history": {
      const lines: string[] = [];
      const touches = store
        .linksTo(entity.id, "touches")
        .map((l) => entityOf(ctx, l.src))
        .filter((e): e is Entity => e !== undefined && e.kind === "commit")
        .sort((a, b) => String(b.attrs["date"] ?? "").localeCompare(String(a.attrs["date"] ?? "")));
      for (const commit of touches) {
        const h = store.internHandle(commit.id);
        lines.push(
          `${String(commit.attrs["date"] ?? "").slice(0, 10)} ${commit.id.slice(7)} "${commit.name}" [${h}]`,
        );
      }
      ({ text, truncated } = cutAtBoundary(lines.join("\n"), FACET_BUDGET_TOKENS));
      break;
    }
    case "diff": {
      // M1 renders the file-level touch set; hunk-level diff needs M2 spans.
      const files = store.linksFrom(entity.id, "touches").map((l) => l.dst.replace(/^file:/, ""));
      text = files.join("\n");
      notes.push("file-level diff summary (hunk-level rendering lands with M2 symbol spans)");
      break;
    }
    case "callers":
    case "callees":
      notes.push(`${facet} needs the code source — it lands at M2; try !history or !text`);
      break;
  }

  return {
    ok: true,
    mode: "facet",
    entityId: entity.id,
    kind: entity.kind,
    handle,
    facet,
    text,
    tokens: estimateTokens(text),
    budgetTokens: FACET_BUDGET_TOKENS,
    truncated,
    partial,
    notes,
  };
}

/** Cut on a semantic boundary (paragraph, then line) under the token budget. */
function cutAtBoundary(text: string, budgetTokens: number): { text: string; truncated: boolean } {
  if (estimateTokens(text) <= budgetTokens) return { text, truncated: false };
  const maxChars = budgetTokens * CHARS_PER_TOKEN;
  const slice = text.slice(0, maxChars);
  const para = slice.lastIndexOf("\n\n");
  if (para > maxChars * 0.5) return { text: slice.slice(0, para).trimEnd(), truncated: true };
  const line = slice.lastIndexOf("\n");
  if (line > 0) return { text: slice.slice(0, line).trimEnd(), truncated: true };
  return { text: slice.trimEnd(), truncated: true };
}
