import { describe, test } from "vitest";

// Global invariants (M1-ACCEPTANCE.md §"Global invariants") — assert on EVERY
// serve response, across every scenario. Wired here as documented `test.todo`
// placeholders in slice 1a; the slice that lands the serving surface (1g) turns
// these into shared assertion helpers applied to all scenarios, and the earlier
// slices adopt them as their surfaces come online.
describe("acceptance: global invariants (G-1..G-7)", () => {
  test.todo("G-1 budget never exceeded; response <=24K chars");
  test.todo("G-2 envelope omission counts reconcile (typed struct level, per §9 addenda)");
  test.todo("G-3 no isError for recoverable conditions; unknown ref -> success-shaped guidance");
  test.todo("G-4 section order stable call-over-call; empty sections omitted, never templated");
  test.todo(
    "G-5 every rendered item carries a resolvable handle (ctx recall <handle> round-trips)",
  );
  test.todo("G-6 no egress: acceptance runs with network asserted unused (assertNoEgress active)");
  test.todo(
    "G-7 tests never touch real ~/.claude/~/.copilot/host configs (temp CTX_HOME/HOME only)",
  );
});
