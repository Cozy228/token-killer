/**
 * Slice 2d — Call edges, facets, mention→symbol (M2-ACCEPTANCE.md "2d"). Wired
 * as `test.todo` in 2a; the slice that owns 2d flips them green. The B6 flagship
 * lives in 2d-biography.test.ts.
 */
import { describe, test } from "vitest";

describe("acceptance: 2d call edges + facets + mention→symbol", () => {
  test.todo(
    "B4-facets: [handle]!callers and [handle]!callees round-trip through serve within the ~800-token facet budget; the M1 'lands at M2' notice is gone",
  );
  test.todo(
    "B4-resolution: callee resolution via the per-language registry with {local,project,builtin,unknown}; ambiguous → unknown; an exact name match across two languages stays unresolved (never cross-language)",
  );
  test.todo(
    "B4-mention: a backticked symbol name in a doc resolves to a references link with symbol-match method (Derived), two-tier confidence (⚠ real doc mention of a real M1 symbol)",
  );
});
