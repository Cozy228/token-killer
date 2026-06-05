import { describe, expect, test } from "vitest";

import { filterRtkOutput } from "../../helpers/rtkCommandHarness.js";

/**
 * tg PRODUCT behavior for curl — deliberate divergences from RTK.
 *
 * This file is NOT a migration/parity suite. RTK's curl_cmd.rs:35-42 collapses the
 * failure output to a single stream: `msg = stderr if non-empty else stdout`, so
 * when curl writes BOTH an HTTP error body (stdout) and a transport diagnostic
 * (stderr), RTK keeps only stderr and silently drops the body. For an LLM reader the
 * dropped body (API error JSON, HTML error page) is usually the most actionable
 * diagnostic, so tg intentionally preserves both streams. Asserting this divergence
 * here — rather than in rtkCurlBehavior.test.ts — keeps the parity suite honest:
 * green over there only ever proves RTK-faithful behavior.
 *
 * Provenance of the divergence: Codex stop-time reviews #1 ("失败输出会被截断") and
 * #2 ("失败路径会丢失 stdout 响应体"). Recorded in docs/green-test-parity-audit.md.
 */
describe("curl product behavior (diverges from RTK)", () => {
  test("preserves both stdout body and stderr diagnostic on failure", async () => {
    const responseBody = '{"error":"rate_limited","retry_after":42}';
    const diagnostic = "curl: (22) The requested URL returned error: 429";
    const result = await filterRtkOutput(
      ["curl", "-f", "https://example.com/api"],
      responseBody,
      22,
      diagnostic,
    );

    // stderr diagnostic — the reason (RTK keeps this).
    expect(result.output).toContain("curl: (22)");
    expect(result.output).toContain("error: 429");
    // stdout response body — the detail. RTK DROPS this; tg keeps it.
    expect(result.output).toContain('"error":"rate_limited"');
    expect(result.output).toContain('"retry_after":42');
  });
});
