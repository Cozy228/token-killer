/**
 * blake2b hashing (P28 addenda: shard keys and short handles are blake2b
 * prefixes). OpenSSL's blake2b512 ships with Node — no native dep.
 */
import { createHash } from "node:crypto";

export function blake2bHex(input: string | Buffer): string {
  return createHash("blake2b512").update(input).digest("hex");
}
