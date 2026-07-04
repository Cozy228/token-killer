/**
 * Memory dedup identity rules (CTX-IMPL §5.6, ported from graphify `dedup.py`).
 *
 * Hard rules preserved from the reference:
 * - Fuzzy matching applies to memory/concept kinds ONLY (code entities are
 *   identity-keyed by id, never fuzzy-merged — enforced by callers).
 * - Gated by an ENTROPY FLOOR: short / low-entropy gists never fuzzy-match
 *   (avoids merging boilerplate one-liners).
 * - DIFFERING-EMBEDDED-NUMBER guard: "ADR 0011" ≠ "ADR 0013" — if the two
 *   gists carry different number tokens they are never candidates.
 * - A match only ever yields a `sameAsCandidate` link (P21) — NEVER a
 *   destructive merge. This module just decides candidacy; the caller records
 *   the non-destructive link/conflict.
 *
 * Dedup never crosses project boundaries — callers only ever compare gists
 * within one store (one project shard).
 */

export const MIN_GIST_CHARS = 24;
export const MIN_ENTROPY_BITS = 2.5;
export const JACCARD_THRESHOLD = 0.6;

export interface DedupVerdict {
  candidate: boolean;
  similarity: number;
  reason: "match" | "below-entropy-floor" | "differing-numbers" | "below-threshold";
}

/** Shannon entropy in bits per character — a low-entropy floor gate. */
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const count of freq.values()) {
    const p = count / s.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/** Multi-digit-aware number tokens embedded in a gist ("ADR 0011" → {"0011"}). */
export function embeddedNumbers(s: string): Set<string> {
  return new Set((s.match(/\d+/g) ?? []).map((n) => n.replace(/^0+(?=\d)/, "")));
}

function wordSet(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim()
      .split(" ")
      .filter((w) => w.length > 0),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function passesEntropyFloor(s: string): boolean {
  return s.trim().length >= MIN_GIST_CHARS && shannonEntropy(s) >= MIN_ENTROPY_BITS;
}

function sameNumberSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const n of a) if (!b.has(n)) return false;
  return true;
}

/**
 * Decide whether two memory gists are near-duplicate CANDIDATES (never a merge).
 * Both must clear the entropy floor; differing embedded numbers veto; then a
 * word-set Jaccard over the threshold flags the candidate.
 */
export function fuzzyDuplicate(a: string, b: string): DedupVerdict {
  if (!passesEntropyFloor(a) || !passesEntropyFloor(b)) {
    return { candidate: false, similarity: 0, reason: "below-entropy-floor" };
  }
  if (!sameNumberSet(embeddedNumbers(a), embeddedNumbers(b))) {
    return { candidate: false, similarity: 0, reason: "differing-numbers" };
  }
  const similarity = jaccard(wordSet(a), wordSet(b));
  return similarity >= JACCARD_THRESHOLD
    ? { candidate: true, similarity, reason: "match" }
    : { candidate: false, similarity, reason: "below-threshold" };
}
