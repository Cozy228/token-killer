// Static-context body metrics (goal "Parser"). Rough heuristics only — chars / 4
// for estimated tokens, matching src/core/savings.ts. No exact token accounting.

import { createHash } from "node:crypto";

import { estimateTokens } from "../core/tokens.js";

export { estimateTokens };

export type BodyMetrics = {
  char_count: number;
  estimated_tokens: number;
  line_count: number;
  heading_count: number;
  code_fence_count: number;
  link_count: number;
  body_hash: string;
};

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

const HEADING_RE = /^#{1,6}\s+\S/;
const LINK_RE = /\[[^\]]*\]\([^)]*\)/g;

// Count metrics over a markdown body. Code-fence lines are still counted toward
// char/line totals (they are real context cost) but link/heading scanning skips
// fenced regions so code samples do not inflate structural counts.
export function computeBodyMetrics(body: string): BodyMetrics {
  const lines = body.split("\n");
  let headingCount = 0;
  let fenceCount = 0;
  let linkCount = 0;
  let inFence = false;

  for (const line of lines) {
    const fenceMatch = /^\s*(```|~~~)/.test(line);
    if (fenceMatch) {
      fenceCount += 1;
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (HEADING_RE.test(line)) headingCount += 1;
    const links = line.match(LINK_RE);
    if (links) linkCount += links.length;
  }

  return {
    char_count: body.length,
    estimated_tokens: estimateTokens(body),
    line_count: lines.length,
    heading_count: headingCount,
    // Two fence markers (open + close) make one block; round up for an unterminated fence.
    code_fence_count: Math.ceil(fenceCount / 2),
    link_count: linkCount,
    body_hash: hashText(body),
  };
}
