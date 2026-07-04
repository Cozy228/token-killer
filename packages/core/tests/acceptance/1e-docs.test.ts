import { describe, test } from "vitest";

// Slice 1e — Docs/decisions source. Flipped green by the 1e implementer.
// A5-adr and A5-stale carry ⚠ verify-at-wiring values (frontmatter fields present;
// a concrete dead reference) — confirm against the repo, never guess.
describe("acceptance: 1e docs/decisions source", () => {
  test.todo("A5-adr"); // ⚠ verify which frontmatter fields ADRs actually carry
  test.todo("A5-mention");
  test.todo("A5-stale"); // ⚠ verify a concrete dead reference at wiring
  test.todo("A5-decision-log");
});
