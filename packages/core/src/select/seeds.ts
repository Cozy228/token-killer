/**
 * Stage 1 — seeds (CONTEXA-IMPL §6.1).
 *
 * Task mode: identifier-aware tokenization → FTS5 bm25 top-64 (scoring sums
 * only the top-3 matches per file) + NAMED-SEED INJECTION (identifier-shaped
 * query tokens resolve via the direct name index AND an exact-token FTS pass,
 * force-included with a large seed weight — bm25 cutoffs must never drop
 * symbols the agent explicitly named). Kind bonuses; test-file demotion unless
 * the query is about tests. ref/handle mode → the entity itself.
 */
import type { Store } from "../store/store.ts";
import type { Entity } from "../store/types.ts";
import {
  ARCHIVE_PATH_DEMOTION,
  DEFINITION_SITE_BOOST,
  FILE_SUFFIX_SEED_LIMIT,
  FTS_SEED_LIMIT,
  KIND_BONUS,
  MAX_SEEDS_PER_FILE,
  NAMED_SEED_WEIGHT,
  TEST_FILE_DEMOTION,
} from "./constants.ts";
import { queryMentionsTests, toFtsMatch, tokenizeQuery, type QueryToken } from "./tokenize.ts";
import type { Visibility } from "./visibility.ts";
import type { Seed } from "./types.ts";

const TEST_PATH_RE = /(^|\/)(tests?|__tests__|spec|specs)\/|\.(test|spec)\.[a-z]+$/i;
const ARCHIVE_PATH_RE = /(^|\/)(archive|archived|attic|deprecated|superseded)\//i;

export function isTestPath(path: string | undefined): boolean {
  return path !== undefined && TEST_PATH_RE.test(path);
}

export function isArchivePath(path: string | undefined): boolean {
  return path !== undefined && ARCHIVE_PATH_RE.test(path);
}

export function entityPath(entity: Entity): string | undefined {
  return entity.locator.t === "file" ? entity.locator.path : undefined;
}

function kindBonus(entity: Entity): number {
  return KIND_BONUS[entity.kind] ?? 1;
}

/** bm25 rank from FTS5 is ascending-better (negative); flip to a positive relevance. */
function lexicalRelevance(rank: number): number {
  return Math.max(1e-6, -rank);
}

export interface SeedStage {
  seeds: Seed[];
  tokens: QueryToken[];
  aboutTests: boolean;
}

export function gatherSeeds(store: Store, query: string, visibility: Visibility): SeedStage {
  const tokens = tokenizeQuery(query, store.projectRoot);
  const aboutTests = queryMentionsTests(tokens);
  const seeds = new Map<string, Seed>();
  const entityCache = new Map<string, Entity | undefined>();
  const getEntity = (id: string): Entity | undefined => {
    if (!entityCache.has(id)) entityCache.set(id, store.getEntity(id));
    return entityCache.get(id);
  };

  const aboutArchive = tokens.some((t) => /^(archives?|archived|history|historical)$/.test(t.text));
  const demotion = (entity: Entity): number => {
    const path = entityPath(entity);
    let d = 1;
    if (!aboutTests && isTestPath(path)) d *= TEST_FILE_DEMOTION;
    if (!aboutArchive && isArchivePath(path)) d *= ARCHIVE_PATH_DEMOTION;
    return d;
  };

  // --- FTS5 bm25 candidates (top-64, top-3 scored matches per file) ---
  const match = toFtsMatch(tokens);
  if (match.length > 0) {
    const perFile = new Map<string, number>();
    for (const hit of store.ftsSearch(match, FTS_SEED_LIMIT)) {
      const entity = getEntity(hit.entityId);
      if (!entity || !visibility.isVisible(entity)) continue;
      // top-3-matches-per-file: hits arrive best-first; past the third hit
      // backed by the same file, further matches stop accumulating seed mass
      // (one sharp hit must outrank many mediocre hits, §6.1).
      const fileKey = entityPath(entity) ?? entity.id;
      const n = perFile.get(fileKey) ?? 0;
      if (n >= MAX_SEEDS_PER_FILE) continue;
      perFile.set(fileKey, n + 1);
      const score = lexicalRelevance(hit.rank) * kindBonus(entity) * demotion(entity);
      const existing = seeds.get(entity.id);
      if (existing) {
        existing.weight += score;
        existing.lexicalScore += score;
      } else {
        seeds.set(entity.id, {
          entityId: entity.id,
          weight: score,
          lexicalScore: score,
          named: false,
        });
      }
    }
  }

  const injectNamed = (id: string, entity: Entity): void => {
    const weight = NAMED_SEED_WEIGHT * kindBonus(entity) * demotion(entity);
    const existing = seeds.get(id);
    if (existing) {
      existing.named = true;
      if (existing.weight < weight) existing.weight = weight;
      if (existing.lexicalScore < weight) existing.lexicalScore = weight;
    } else {
      seeds.set(id, { entityId: id, weight, lexicalScore: weight, named: true });
    }
  };

  // --- path-aware file seeding + flood control (FIX-2) ---
  // A path-/basename-shaped token resolves to FILE entities by path suffix
  // (file entities are named by full relative path, so entitiesByName misses a
  // bare basename). When it resolves to ≥1 real file, seed those files as named
  // seeds AND suppress this token's exact-FTS injection below — otherwise every
  // prose section MENTIONING the file gets force-injected at NAMED_SEED_WEIGHT
  // and floods out the actual code (those mentions stay reachable via the
  // general bm25 pass). A token that resolves to no file falls through to the
  // ordinary name/FTS named-seed path, so prose remains reachable.
  const fileResolvedTokens = new Set<string>();
  for (const token of tokens) {
    if (!token.fileShaped) continue;
    const files = store.filesByPathSuffix(token.text, FILE_SUFFIX_SEED_LIMIT);
    let resolved = false;
    for (const entity of files) {
      if (!visibility.isVisible(entity)) continue;
      injectNamed(entity.id, entity);
      resolved = true;
    }
    if (resolved) fileResolvedTokens.add(token.text);
  }

  // --- named-seed injection (force-include, large weight) ---
  for (const token of tokens) {
    if (!token.distinctive) continue;
    const targets = new Set<string>();
    // (a) direct name index — an entity NAMED like the token.
    for (const e of store.entitiesByName(token.raw)) targets.add(e.id);
    // (b) exact-token FTS pass — entities whose indexed text carries the
    // identifier verbatim (uncut by the general query's bm25 top-64). Skipped
    // for a token already resolved to a file (FIX-2 flood control).
    if (!fileResolvedTokens.has(token.text)) {
      for (const hit of store.ftsSearch(`"${token.text.replace(/"/g, "")}"`, FTS_SEED_LIMIT)) {
        targets.add(hit.entityId);
      }
    }
    for (const id of targets) {
      const entity = getEntity(id);
      if (!entity || !visibility.isVisible(entity)) continue;
      injectNamed(id, entity);
    }
  }

  // --- acronym definition-site boost (§6.1 one-sharp-hit principle) ---
  // For an acronym-shaped query token (RRF, PPR, SCIP…), the section that
  // DEFINES it carries the `…Full Phrase (ACRONYM…` pattern; a mention does
  // not. Read through the (≤64+named) candidates and boost definition sites —
  // deterministic, zero-LLM, disclosed via DEFINITION_SITE_BOOST.
  const acronyms = tokens.filter((t) => !t.derived && /^[A-Z]{2,6}$/.test(t.raw)).map((t) => t.raw);
  if (acronyms.length > 0) {
    for (const seed of seeds.values()) {
      const rt = store.readThrough(seed.entityId);
      if (!rt.ok) continue;
      if (acronyms.some((a) => rt.text.includes(`(${a}`))) {
        seed.weight *= DEFINITION_SITE_BOOST;
        seed.lexicalScore *= DEFINITION_SITE_BOOST;
      }
    }
  }

  return { seeds: [...seeds.values()], tokens, aboutTests };
}

/** ref/handle mode → the entity itself is the (only) seed (§6.1). */
export function refSeed(entityId: string): SeedStage {
  return {
    seeds: [{ entityId, weight: 1, lexicalScore: 1, named: true }],
    tokens: [],
    aboutTests: false,
  };
}
