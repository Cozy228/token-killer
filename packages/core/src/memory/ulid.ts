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
