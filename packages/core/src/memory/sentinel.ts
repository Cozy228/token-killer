/**
 * Echo exclusion (CTX-IMPL §5.6, P28 bar): a host memory file may contain a
 * ctx-managed push block (the digest ctx itself wrote — see §7). Re-importing
 * that block would echo our own output back into the store, so it is stripped
 * before an entity is created.
 *
 * The M1 bar is EXACT sentinel-block match only (paraphrase echo is out of M1
 * scope): a `<!-- ctx:managed:begin -->` … `<!-- ctx:managed:end -->` block.
 * `stripSentinelBlocks` also drops any stray unmatched marker line, so no
 * imported text can ever contain the `ctx:managed:begin` substring (A1-echo).
 */
export const SENTINEL_BEGIN = "ctx:managed:begin";
export const SENTINEL_END = "ctx:managed:end";

const SENTINEL_BLOCK = /<!--\s*ctx:managed:begin\s*-->[\s\S]*?<!--\s*ctx:managed:end\s*-->/g;

/** True if the text contains either managed sentinel marker. */
export function hasSentinel(text: string): boolean {
  return text.includes(SENTINEL_BEGIN) || text.includes(SENTINEL_END);
}

/**
 * Remove every managed block, then defensively drop any residual line still
 * carrying a marker (unbalanced/hand-edited block). The result is guaranteed
 * free of the `ctx:managed:*` substrings.
 */
export function stripSentinelBlocks(text: string): string {
  let out = text.replace(SENTINEL_BLOCK, "");
  if (hasSentinel(out)) {
    out = out
      .split("\n")
      .filter((line) => !line.includes(SENTINEL_BEGIN) && !line.includes(SENTINEL_END))
      .join("\n");
  }
  return out;
}
