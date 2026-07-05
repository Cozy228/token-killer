/**
 * Stage 5 — projection primitives (CTX-IMPL §6.5): kind-specific compact
 * renders at three tiers (full → skeleton → line+handle), token estimate =
 * chars/4, semantic-boundary content (whole tiers only — an item is never cut
 * mid-tier; a tier that doesn't fit demotes to the next one).
 *
 * The summary-smaller-than-original rule is enforced here: a skeleton that
 * isn't smaller than its full text is discarded in favor of the original.
 */
import type { Store } from "../store/store.ts";
import type { Entity } from "../store/types.ts";
import { CHARS_PER_TOKEN } from "./constants.ts";
import type { RenderTier } from "./types.ts";

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

export function locatorDisplay(entity: Entity): string | undefined {
  const loc = entity.locator;
  switch (loc.t) {
    case "file":
      return loc.span ? `${loc.path}:${loc.span[0]}-${loc.span[1]}` : loc.path;
    case "git":
      return loc.oid.slice(0, 12);
    case "store":
      return undefined;
    case "snapshot":
      return `${loc.carrier}:${loc.file}`;
  }
}

/** The one-line render every tier starts from (name · locator · handle). */
export function renderLineText(entity: Entity, handle: string): string {
  const loc = locatorDisplay(entity);
  return loc ? `${entity.name} ${loc} [${handle}]` : `${entity.name} [${handle}]`;
}

/** First meaningful content line: non-empty, not a markdown heading/fence. */
function firstContentLine(text: string, skipFirst: boolean): string | undefined {
  const lines = text.split("\n");
  for (let i = skipFirst ? 1 : 0; i < lines.length; i++) {
    const t = lines[i]!.trim();
    if (t.length === 0 || t.startsWith("#") || t.startsWith("```")) continue;
    return t;
  }
  return undefined;
}

/** Strip the raw-commit header `git cat-file -p` returns; keep the message. */
export function commitMessageOf(raw: string): string {
  const cut = raw.indexOf("\n\n");
  return (cut === -1 ? raw : raw.slice(cut + 2)).trimEnd();
}

export interface TierRender {
  tier: RenderTier;
  text: string;
  tokens: number;
  /** True when a full-tier read-through failed (envelope `partial`, §7). */
  readFailed?: boolean;
}

function commitMeta(entity: Entity): string {
  const date = typeof entity.attrs["date"] === "string" ? (entity.attrs["date"] as string) : "";
  const author =
    typeof entity.attrs["author"] === "string" ? (entity.attrs["author"] as string) : "";
  return [date.slice(0, 10), author && `@${author}`].filter(Boolean).join(" ");
}

/** Render one entity at the requested tier (whole tiers, never mid-cut). */
export function renderAtTier(
  store: Store,
  entity: Entity,
  handle: string,
  tier: RenderTier,
): TierRender {
  const line = renderLineText(entity, handle);
  if (tier === "line") {
    return { tier, text: line, tokens: estimateTokens(line) };
  }

  if (entity.kind === "memory") {
    const mem = store.getMemory(entity.id);
    const gist = mem?.gist ?? entity.name;
    // Drift-honest surfacing (2c/B6): a memory that isn't `active` (e.g. an
    // anchor whose symbol drifted → `needs-review`) is flagged so the served
    // answer never presents stale guidance as clean.
    const flag = mem && mem.status !== "active" ? `⚠ ${mem.status}: ` : "";
    if (tier === "skeleton" || !mem?.detail) {
      const text = `${flag}${gist} [${handle}]`;
      return { tier: "skeleton", text, tokens: estimateTokens(text) };
    }
    const text = `${flag}${gist} [${handle}]\n${mem.detail}`;
    return { tier: "full", text, tokens: estimateTokens(text) };
  }

  if (entity.kind === "commit") {
    const head = `${commitMeta(entity)} "${entity.name}" [${handle}]`.trim();
    if (tier === "skeleton") return { tier, text: head, tokens: estimateTokens(head) };
    const rt = store.readThrough(entity.id);
    if (!rt.ok) {
      return { tier: "skeleton", text: head, tokens: estimateTokens(head), readFailed: true };
    }
    const body = commitMessageOf(rt.text);
    const text = body.length > 0 ? `${head}\n${body}` : head;
    return { tier: "full", text, tokens: estimateTokens(text) };
  }

  // file/doc_section/decision/concept (+ future kinds): locator read-through.
  const rt = store.readThrough(entity.id);
  if (!rt.ok) {
    // Recoverable (G-3): degrade to the line tier; caller records `partial`.
    return { tier: "line", text: line, tokens: estimateTokens(line), readFailed: true };
  }
  if (tier === "skeleton") {
    // Doc-backed sections start at their heading line — skip it for the gist line.
    const startsAtHeading = rt.text.trimStart().startsWith("#");
    const gist = firstContentLine(rt.text, startsAtHeading);
    const text = gist ? `${line}\n  ${gist}` : line;
    return { tier: "skeleton", text, tokens: estimateTokens(text) };
  }
  const text = `${line}\n${rt.text.trimEnd()}`;
  return { tier: "full", text, tokens: estimateTokens(text) };
}

/**
 * Best render that fits `budgetTokens`, starting from `maxTier` and demoting
 * (full → skeleton → line). Enforces summary-smaller-than-original: a skeleton
 * ≥ its full render is replaced by the full render when that fits.
 * Returns undefined when even the line tier does not fit (→ omission).
 */
export function renderWithinBudget(
  store: Store,
  entity: Entity,
  handle: string,
  maxTier: RenderTier,
  budgetTokens: number,
): TierRender | undefined {
  if (budgetTokens <= 0) return undefined;
  const lineR = renderAtTier(store, entity, handle, "line");
  if (maxTier === "line") return lineR.tokens <= budgetTokens ? lineR : undefined;

  const full = renderAtTier(store, entity, handle, "full");
  if (full.readFailed) {
    // Read-through failed (recoverable, G-3): serve what metadata-only tiers
    // can offer and let the caller record `partial`.
    const fallback = full.tier === "line" ? lineR : full;
    if (fallback.tokens <= budgetTokens) return { ...fallback, readFailed: true };
    return lineR.tokens <= budgetTokens ? { ...lineR, readFailed: true } : undefined;
  }
  if (maxTier === "full" && full.tokens <= budgetTokens) return full;

  const skeleton = renderAtTier(store, entity, handle, "skeleton");
  // Summary-smaller-than-original (§6.5): a skeleton that isn't smaller than
  // the full text yields to the original whenever the original fits.
  if (full.tokens <= skeleton.tokens && full.tokens <= budgetTokens) return full;
  if (skeleton.tokens <= budgetTokens) return skeleton;
  return lineR.tokens <= budgetTokens ? lineR : undefined;
}
