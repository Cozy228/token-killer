import { describe, expect, test } from "vitest";

import { computeBodyMetrics, estimateTokens, hashText } from "../../../src/context/metrics.js";

describe("context/metrics", () => {
  test("counts headings, fences, links; skips fenced regions for structural counts", () => {
    const body = [
      "# One",
      "see [link](http://x)",
      "## Two",
      "```ts",
      "# not a heading",
      "const a = [b](c);",
      "```",
      "tail [other](y)",
    ].join("\n");
    const m = computeBodyMetrics(body);
    expect(m.heading_count).toBe(2);
    expect(m.code_fence_count).toBe(1);
    expect(m.link_count).toBe(2); // the in-fence pseudo-link is not counted
    expect(m.line_count).toBe(8);
  });

  test("estimated tokens use the shared segmented estimator", () => {
    expect(estimateTokens("abcdefgh")).toBe(3); // 8 letters / 3.8 → ceil
    const m = computeBodyMetrics("abcd");
    expect(m.estimated_tokens).toBe(2); // 4 / 3.8 → ceil
    expect(m.char_count).toBe(4);
  });

  test("body hash is stable and content-sensitive", () => {
    expect(hashText("same")).toBe(hashText("same"));
    expect(hashText("a")).not.toBe(hashText("b"));
  });
});
