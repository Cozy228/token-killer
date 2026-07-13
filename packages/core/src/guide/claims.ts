/**
 * Claim-set aggregation (D33 + PRODUCT-DESIGN §3).
 *
 * D33: an aggregated edge/step carries
 *   {relationKind, count, constituentClaimIds[], evidenceRevisions[], derivations[],
 *    confidenceSummary, freshness, disclosure, omittedCount}
 * — NEVER "count + first claim id". Every constituent is listed, so E5 ("every aggregate
 * count can be expanded to its constituent claims") is satisfiable from the DTO alone.
 *
 * PRODUCT-DESIGN §3: "an aggregate is never more confident than its weakest constituent".
 * `confidenceSummary.weakest` is therefore the ONLY tier a renderer may present for an
 * aggregate, and `null` (unknown provenance) is weaker than every named tier.
 *
 * Revisions: only a `git`-carried claim names a revision — its `locus` IS the commit oid.
 * A `tree-sitter` structural claim records a generation, and the store keeps no
 * per-generation revision history, so a revision is NOT invented for it; those
 * constituents are counted in `revisionsUnresolved`. Fabricating a plausible revision
 * would be exactly the "every number is a store fact with provenance, or it does not
 * render" rule broken.
 */
import type { Claim, Confidence, Derivation, Disclosure } from "../store/types.ts";
import type { Store } from "../store/store.ts";
import type { ClaimSet, ConfidenceSummary, Relation, RelationKind } from "./types.ts";

/** Strongest first. `null` = unknown provenance, and is weaker than every tier. */
const CONFIDENCE_ORDER: readonly (Confidence | null)[] = [
  "CONFIRMED",
  "LIKELY",
  "POSSIBLE",
  null,
];

/** Most permissive first; the aggregate takes the LAST (most restrictive) present. */
const DISCLOSURE_ORDER: readonly Disclosure[] = ["shared", "local", "restricted"];

const OID_RE = /^[0-9a-f]{40}$/;

/** Caches claim lookups across the many aggregates of one projection. */
export class ClaimReader {
  readonly #store: Store;
  readonly #cache = new Map<number, Claim | undefined>();

  constructor(store: Store) {
    this.#store = store;
  }

  get(id: number): Claim | undefined {
    if (!this.#cache.has(id)) this.#cache.set(id, this.#store.getClaim(id));
    return this.#cache.get(id);
  }
}

/**
 * Aggregate `relations` (all of one kind) into ONE claim set.
 *
 * @param omittedCount constituents the consumer cannot inspect individually in this
 *   projection — because their far endpoint collapsed into a boundary node or a
 *   collapsed container. `0` when every constituent is individually reachable.
 */
export function aggregateClaims(
  reader: ClaimReader,
  kind: RelationKind,
  relations: readonly Relation[],
  omittedCount = 0,
): ClaimSet {
  const constituentClaimIds: number[] = [];
  const constituents: { src: string; dst: string }[] = [];
  const revisions = new Set<string>();
  const generations = new Set<number>();
  const derivations = new Set<Derivation | null>();
  const tiers = new Set<Confidence | null>();
  const disclosures = new Set<Disclosure>();
  let revisionsUnresolved = 0;
  let stale = false;

  for (const relation of relations) {
    constituents.push({ src: relation.src, dst: relation.dst });
    if (relation.stale) stale = true;

    if (relation.claimId === undefined) {
      // No provenance back-pointer: unknown derivation + unknown confidence. It must
      // never render as a likely fact (DR-02), and it drags the aggregate's tier down.
      derivations.add(null);
      tiers.add(null);
      revisionsUnresolved += 1;
      continue;
    }
    constituentClaimIds.push(relation.claimId);

    const claim = reader.get(relation.claimId);
    if (!claim) {
      derivations.add(null);
      tiers.add(null);
      revisionsUnresolved += 1;
      continue;
    }
    derivations.add(claim.derivation);
    tiers.add(claim.confidence);
    generations.add(claim.gen);

    const revision = revisionOf(claim);
    if (revision === undefined) revisionsUnresolved += 1;
    else revisions.add(revision);
  }

  // The store has no per-claim disclosure column; structural code/git evidence is
  // local-facet by default (LAW §4). Kept as a set so a future restricted carrier
  // narrows the aggregate rather than being averaged away.
  disclosures.add("local");

  return {
    relationKind: kind,
    count: relations.length,
    constituentClaimIds,
    constituents,
    evidenceRevisions: [...revisions].sort(),
    evidenceGenerations: [...generations].sort((a, b) => a - b),
    revisionsUnresolved,
    derivations: [...derivations],
    confidenceSummary: summarise(tiers),
    freshness: stale ? "stale" : "fresh",
    disclosure: weakestDisclosure(disclosures),
    omittedCount,
  };
}

/**
 * A claim's source revision, or `undefined` when the store cannot resolve one.
 * `git` claims carry the commit oid as their locus; nothing else names a revision.
 */
function revisionOf(claim: Claim): string | undefined {
  if (claim.carrier !== "git") return undefined;
  const locus = claim.locus;
  return locus !== undefined && OID_RE.test(locus) ? locus : undefined;
}

/** The aggregate may claim no tier stronger than its weakest constituent (§3). */
function summarise(tiers: ReadonlySet<Confidence | null>): ConfidenceSummary {
  if (tiers.size === 0) return { weakest: null, tiers: [] };
  const present = CONFIDENCE_ORDER.filter((tier) => tiers.has(tier));
  return {
    weakest: present[present.length - 1] ?? null,
    tiers: present,
  };
}

function weakestDisclosure(present: ReadonlySet<Disclosure>): Disclosure {
  let weakest: Disclosure = "shared";
  for (const candidate of DISCLOSURE_ORDER) {
    if (present.has(candidate)) weakest = candidate;
  }
  return weakest;
}
