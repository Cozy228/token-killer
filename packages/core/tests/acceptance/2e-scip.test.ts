/**
 * Slice 2e — SCIP arbitration (M2-ACCEPTANCE.md "2e"). Wired as `test.todo` in
 * 2a; the slice that owns 2e flips them green (spec read-back
 * docs/codemap/impl/appendix-A1-copyable.md:480–500).
 */
import { describe, test } from "vitest";

describe("acceptance: 2e SCIP arbitration", () => {
  test.todo(
    "B5-upgrade: with a fixture index.scip present, identity/reference claims for covered symbols carry authority=observed; tree-sitter-only symbols stay Derived",
  );
  test.todo(
    "B5-jurisdiction: overlapping tree-sitter × SCIP same-predicate claims arbitrate to ONE link (no duplicate edges); provenance discloses the winner",
  );
  test.todo(
    "B5-failopen: malformed/truncated index.scip → ingest completes on tree-sitter alone, success-shaped disclosure, no partial SCIP claims left behind (D16 fail-open rollback)",
  );
});
