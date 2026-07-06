/**
 * ULID generation for memory entity ids (`mem:<ulid>`, CTX-IMPL §3).
 *
 * A ULID is a 26-char Crockford base32 string: 10 chars of 48-bit millisecond
 * timestamp + 16 chars of 80-bit randomness. We support two flavours:
 *
 * - `ulid(now, random)` — a fresh ULID for `remember()` (time-ordered, unique).
 * - `deterministicUlid(timeMs, seed)` — a STABLE ULID derived from a seed
 *   string, so re-importing the same host memory file yields the same id
 *   (idempotent import / dedup by identity, §5.6). It is still ULID-shaped, so
 *   `kindInitial`/handles keep working uniformly.
 */
import { randomBytes } from "node:crypto";
import { blake2bHex } from "../store/hash.ts";

// Crockford base32 (excludes I, L, O, U) — the canonical ULID alphabet.
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const TIME_LEN = 10;
const RAND_LEN = 16;

/** Encode a non-negative integer into `len` Crockford base32 chars (big-endian). */
function encodeTime(ms: number, len: number): string {
  let n = Math.floor(ms);
  const out: string[] = [];
  for (let i = 0; i < len; i++) {
    out.push(CROCKFORD[n % 32] as string);
    n = Math.floor(n / 32);
  }
  return out.reverse().join("");
}

/** Encode a byte buffer into `len` Crockford base32 chars (5 bits per char). */
function encodeRandom(bytes: Uint8Array, len: number): string {
  let out = "";
  let acc = 0;
  let bits = 0;
  let i = 0;
  while (out.length < len) {
    if (bits < 5) {
      acc = (acc << 8) | (bytes[i % bytes.length] as number);
      bits += 8;
      i++;
    }
    bits -= 5;
    out += CROCKFORD[(acc >>> bits) & 31] as string;
  }
  return out;
}

/** A fresh, time-ordered ULID (for `remember()`). */
export function ulid(nowMs: number = Date.now(), random: Uint8Array = randomBytes(10)): string {
  return encodeTime(nowMs, TIME_LEN) + encodeRandom(random, RAND_LEN);
}

/** Increment a Crockford base32 string by one, with carry (for monotonic ULIDs). */
function incrementCrockford(s: string): string {
  const chars = s.split("");
  for (let i = chars.length - 1; i >= 0; i--) {
    const idx = CROCKFORD.indexOf(chars[i] as string);
    if (idx < 31) {
      chars[i] = CROCKFORD[idx + 1] as string;
      return chars.join("");
    }
    chars[i] = CROCKFORD[0] as string; // carry into the next-higher char
  }
  return chars.join(""); // 80-bit overflow (practically unreachable) — wraps
}

/**
 * A MONOTONIC ULID factory (the E2 tiebreaker must reflect causal order). ULID
 * timestamps are millisecond-granular; two events created in the same ms would
 * otherwise get random, causally-meaningless low bits, so the `(at, then ULID)`
 * fold could pick the wrong winner. This factory guarantees that a later call
 * yields a strictly larger ULID even within the same (or a non-advancing) ms, by
 * incrementing the previous random part. One instance per single-writer store.
 */
export function monotonicUlidFactory(
  random: () => Uint8Array = () => randomBytes(10),
): (nowMs?: number) => string {
  let lastMs = -1;
  let lastRand = "";
  return (nowMs: number = Date.now()): string => {
    if (nowMs > lastMs) {
      lastMs = nowMs;
      lastRand = encodeRandom(random(), RAND_LEN);
    } else {
      // Same ms or a backwards clock: keep the (larger) reference ms and bump
      // the random part so the id stays strictly monotonic within this writer.
      lastRand = incrementCrockford(lastRand);
    }
    return encodeTime(lastMs, TIME_LEN) + lastRand;
  };
}

/**
 * A deterministic ULID derived from (timeMs, seed): same inputs → same id.
 * Used by host importers so a re-import upserts in place instead of duplicating.
 */
export function deterministicUlid(timeMs: number, seed: string): string {
  const digest = blake2bHex(seed);
  const bytes = Buffer.from(digest.slice(0, 20), "hex"); // 10 bytes of entropy
  return encodeTime(timeMs, TIME_LEN) + encodeRandom(bytes, RAND_LEN);
}

/** Build a `mem:<ulid>` entity id. */
export function memoryId(id: string): string {
  return `mem:${id}`;
}
