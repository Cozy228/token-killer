/**
 * `ctx guide` acceptance checklist (M3-GOAL-PROMPT V3 gates + V4 additions),
 * wired as `test.todo` so the reviewer-owned bar is visible and tracked. Slice 5b
 * IMPLEMENTS the server/data/auth/lifecycle gates now (see the real suites below);
 * the remaining gates land in their slices (5c–5i) and stay todo here.
 *
 * Implemented now (real tests exist — see the file in parentheses):
 *   - G-loopback         guide-server.test.ts + guide-auth.test.ts
 *   - G-auth-ux          guide-server.test.ts (token→cookie, single-use, 401)
 *   - G-lifecycle        guide-idle.test.ts (idle backstop) + server close()
 *   - G-empty-state      guide-corpus.test.ts + emptyCorpus() (files:[] → `ctx sync`)
 *   - G-fixture-isolation guide-corpus.test.ts (no store access in --fixture)
 *   - G-readonly         guide-server.test.ts (405 on mutating method; read-only serve)
 */
import { describe, test } from "vitest";

describe("ctx guide acceptance gates (V3 + V4)", () => {
  // Implemented in slice 5b (kept as living reminders of the owned bar).
  test.todo("G-loopback: 127.0.0.1 only; token-or-cookie required on EVERY route");
  test.todo("G-auth-ux: no token in the address bar after first load; F5/deep links survive");
  test.todo("G-lifecycle: no beacon teardown; Ctrl-C graceful; idle backstop fires + resets");
  test.todo("G-empty-state: a fresh temp-home store renders the `ctx sync` instruction");
  test.todo("G-fixture-isolation: `--fixture` leaves the real store byte-identical");
  test.todo("G-readonly: route sweep proves no mutating endpoint");
  test.todo("G-egress: zero external requests (assertNoEgress + bundle audit)");

  // Later slices (5c–5i) — data/projection/UI gates.
  test.todo("G-provenance: every rendered fact resolves to an evidence anchor (5d/5g)");
  test.todo("G-honest-gap: null/compat-shadow fields render as disclosed gaps (5c+)");
  test.todo("G-budget: every projection declares budgets and discloses omissions (5c)");
  test.todo("G-one-render-path: export-diff green (5h)");
  test.todo("G-perf-recorded: latency / node count / JSON bytes recorded real + 10× (5h)");
  test.todo("G-perf-budget (NEW): D12 table on a production build, real + 10× (5c/5h)");
  test.todo("G-anchor-hygiene (NEW): 5e ladder golden tests");
  test.todo("G-naming-gate (NEW): grep-able copy test — Change Trace / Static Reachability (5i)");
  test.todo("G-event-determinism (NEW): byte-identical projection JSON per generation (5i)");
});
