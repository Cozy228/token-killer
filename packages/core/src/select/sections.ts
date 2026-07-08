/**
 * Stage 4 — sections + marginal-utility borrowing (CONTEXA-IMPL §6.4).
 *
 * Bucket ranked candidates by content type; per-section caps = fixed shares of
 * the tier budget (lean ≈1200 tokens; wide = 3× same percentages, P28).
 * Unused budget flows to the globally highest-scored omitted item.
 * CONFLICTS ARE NEVER SQUEEZED: answer-relevant conflicts preempt other
 * sections' borrowing (they draw from the pool first).
 *
 * Every omission is counted AND handle'd on the typed struct (§6.5); the §10
 * properties "budget never exceeded" and "omission counts reconcile" are
 * enforced by construction here and pinned by tests.
 */
import type { Store } from "../store/store.ts";
import type { Entity, EntityKind } from "../store/types.ts";
import {
  FULL_TIER_MIN_FRACTION,
  LEAN_TOTAL_TOKENS,
  MARGINAL_SCORE_FLOOR,
  SECTION_SHARE,
  SKELETON_TIER_MIN_FRACTION,
  WIDE_MULTIPLIER,
  disclosedConstants,
} from "./constants.ts";
import { estimateTokens, locatorDisplay, renderWithinBudget } from "./project.ts";
import type {
  BudgetTier,
  OmittedItem,
  RenderedItem,
  RenderTier,
  SectionName,
  SectionResult,
  SelectionEnvelope,
} from "./types.ts";
import { SECTION_ORDER } from "./types.ts";

/** Content-type buckets (§6.4). doc/glossary knowledge rides with decisions in M1. */
export function sectionOf(kind: EntityKind): Exclude<SectionName, "subject" | "conflicts"> {
  switch (kind) {
    case "symbol":
    case "file":
    case "module":
      return "code";
    case "decision":
    case "doc_section":
    case "concept":
      return "decisions";
    case "commit":
    case "pr":
    case "issue":
    case "story":
    case "meeting":
      return "history";
    case "memory":
      return "memory";
  }
}

export interface RankedCandidate {
  entity: Entity;
  score: number;
}

/** A conflict rendered as an item anchored on its subject entity. */
export interface ConflictCandidate {
  subject: Entity;
  text: string;
  score: number;
}

export function totalBudgetTokens(tier: BudgetTier): number {
  return tier === "wide" ? LEAN_TOTAL_TOKENS * WIDE_MULTIPLIER : LEAN_TOTAL_TOKENS;
}

export function sectionBudgets(
  tier: BudgetTier,
): Record<SectionName, number> & { envelope: number } {
  const total = totalBudgetTokens(tier);
  return {
    subject: Math.floor(total * SECTION_SHARE.subject),
    code: Math.floor(total * SECTION_SHARE.code),
    decisions: Math.floor(total * SECTION_SHARE.decisions),
    history: Math.floor(total * SECTION_SHARE.history),
    memory: Math.floor(total * SECTION_SHARE.memory),
    conflicts: Math.floor(total * SECTION_SHARE.conflicts),
    envelope: Math.floor(total * SECTION_SHARE.envelope),
  };
}

interface PendingItem {
  entity: Entity;
  score: number;
  section: SectionName;
  maxTier: RenderTier;
  /** Pre-rendered text for conflict items (not entity-render-derived). */
  fixedText?: string;
}

function intendedTier(score: number, sectionTop: number): RenderTier {
  if (sectionTop <= 0) return "line";
  const f = score / sectionTop;
  if (f < MARGINAL_SCORE_FLOOR) return "line"; // omit-with-handle beats degraded-inline
  if (f >= FULL_TIER_MIN_FRACTION) return "full";
  if (f >= SKELETON_TIER_MIN_FRACTION) return "skeleton";
  return "line";
}

export interface AssembledSections {
  sections: SectionResult[];
  envelope: SelectionEnvelope;
}

/**
 * Assemble sections under the budget. `subject` (when present) renders first
 * into its own share; `conflicts` render with first claim on the borrow pool.
 */
export function assembleSections(
  store: Store,
  subject: Entity | undefined,
  candidates: RankedCandidate[],
  conflicts: ConflictCandidate[],
  tier: BudgetTier,
): AssembledSections {
  const budgets = sectionBudgets(tier);
  const notes: string[] = [];
  let partial = false;

  // ---- bucketize (subject never double-renders in its kind bucket) ----
  const buckets = new Map<SectionName, PendingItem[]>();
  for (const name of SECTION_ORDER) buckets.set(name, []);
  if (subject) {
    buckets.get("subject")!.push({
      entity: subject,
      score: Number.POSITIVE_INFINITY,
      section: "subject",
      maxTier: "full",
    });
  }
  for (const c of candidates) {
    if (subject && c.entity.id === subject.id) continue;
    const section = sectionOf(c.entity.kind);
    buckets.get(section)!.push({ entity: c.entity, score: c.score, section, maxTier: "full" });
  }
  for (const c of conflicts) {
    buckets.get("conflicts")!.push({
      entity: c.subject,
      score: c.score,
      section: "conflicts",
      maxTier: "line",
      fixedText: c.text,
    });
  }

  // ---- per-section greedy render inside the base cap ----
  const results = new Map<SectionName, SectionResult>();
  const leftovers: PendingItem[] = [];
  for (const name of SECTION_ORDER) {
    const pending = buckets
      .get(name)!
      .sort((a, b) => b.score - a.score || (a.entity.id < b.entity.id ? -1 : 1));
    const cap = budgets[name];
    const items: RenderedItem[] = [];
    let used = 0;
    const top = pending.length > 0 ? pending[0]!.score : 0;
    for (const p of pending) {
      if (p.fixedText === undefined) {
        p.maxTier =
          name === "subject" ? "full" : intendedTier(p.score, Number.isFinite(top) ? top : 1);
      }
      const rendered = renderPending(store, p, cap - used);
      if (rendered) {
        if (rendered.readFailed) partial = true;
        items.push(rendered.item);
        used += rendered.item.tokens;
      } else {
        leftovers.push(p);
      }
    }
    results.set(name, {
      name,
      items,
      omitted: [],
      budgetTokens: cap,
      usedTokens: used,
      considered: pending.length,
    });
  }

  // ---- marginal-utility borrowing (conflicts preempt) ----
  let pool = 0;
  for (const name of SECTION_ORDER) {
    const r = results.get(name)!;
    pool += r.budgetTokens - r.usedTokens;
  }
  const borrowOrder = leftovers.sort(
    (a, b) =>
      // conflicts first (never squeezed), then globally highest-scored
      Number(b.section === "conflicts") - Number(a.section === "conflicts") ||
      b.score - a.score ||
      (a.entity.id < b.entity.id ? -1 : 1),
  );
  for (const p of borrowOrder) {
    const r = results.get(p.section)!;
    const rendered = pool > 0 ? renderPending(store, p, pool) : undefined;
    if (rendered) {
      if (rendered.readFailed) partial = true;
      r.items.push(rendered.item);
      r.usedTokens += rendered.item.tokens;
      pool -= rendered.item.tokens;
    } else {
      const handle = store.internHandle(p.entity.id);
      r.omitted.push({
        entityId: p.entity.id,
        kind: p.entity.kind,
        name: p.entity.name,
        handle,
        score: Number.isFinite(p.score) ? p.score : 0,
        section: p.section,
      });
    }
  }

  // ---- envelope (typed struct; markdown is 1g's job) ----
  const sections = SECTION_ORDER.map((name) => results.get(name)!);
  let usedTokens = 0;
  let omittedTotal = 0;
  for (const s of sections) {
    usedTokens += s.usedTokens;
    omittedTotal += s.omitted.length;
  }
  const perSectionBudget = Object.fromEntries(
    sections.map((s) => [s.name, s.budgetTokens]),
  ) as Record<SectionName, number>;
  const envelope: SelectionEnvelope = {
    budgetTier: tier,
    totalBudgetTokens: totalBudgetTokens(tier),
    envelopeReserveTokens: budgets.envelope,
    perSectionBudget,
    usedTokens,
    omittedTotal,
    truncated: omittedTotal > 0,
    partial,
    constants: disclosedConstants(),
    notes,
  };
  return { sections, envelope };
}

function renderPending(
  store: Store,
  p: PendingItem,
  budgetTokens: number,
): { item: RenderedItem; readFailed: boolean } | undefined {
  if (budgetTokens <= 0) return undefined;
  const handle = store.internHandle(p.entity.id);
  if (p.fixedText !== undefined) {
    const tokens = estimateTokens(p.fixedText);
    if (tokens > budgetTokens) return undefined;
    return {
      item: {
        entityId: p.entity.id,
        kind: p.entity.kind,
        name: p.entity.name,
        handle,
        tier: "line",
        text: p.fixedText,
        tokens,
        score: p.score,
      },
      readFailed: false,
    };
  }
  const r = renderWithinBudget(store, p.entity, handle, p.maxTier, budgetTokens);
  if (!r) return undefined;
  const locator = locatorDisplay(p.entity);
  return {
    item: {
      entityId: p.entity.id,
      kind: p.entity.kind,
      name: p.entity.name,
      handle,
      tier: r.tier,
      text: r.text,
      tokens: r.tokens,
      score: Number.isFinite(p.score) ? p.score : 0,
      ...(locator !== undefined ? { locator } : {}),
    },
    readFailed: r.readFailed === true,
  };
}
