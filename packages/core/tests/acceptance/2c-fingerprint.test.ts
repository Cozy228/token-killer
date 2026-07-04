/**
 * Slice 2c — Fingerprint invalidation + incremental correctness trio
 * (M2-ACCEPTANCE.md "2c"). Wired as `test.todo` in 2a; the slice that owns 2c
 * flips them green.
 */
import { describe, test } from "vitest";

describe("acceptance: 2c fingerprint invalidation + incremental trio", () => {
  test.todo(
    "B3-cosmetic: reformat/comment-only edit → structural fingerprint COSMETIC → hashes updated, NO re-link/invalidation cascade, memory anchors untouched",
  );
  test.todo(
    "B3-drift: signature/body change to an anchored symbol → STRUCTURAL → anchored memory needs-review, reason-classed signature-changed/body-changed (the §9 anchor-drift item)",
  );
  test.todo(
    "B3-boundary: 1-hop boundary expansion — editing a barrel re-export re-ingests the unchanged-side file whose edge crossed the boundary",
  );
  test.todo(
    "B3-shadow: adding a file that can steal an existing import/mention resolution triggers re-resolution of pre-existing files (same-basename/different-ext)",
  );
  test.todo(
    "B3-shrink: an extraction pass producing a drastically smaller symbol graph without observed deletions refuses to publish; success-shaped report discloses the refusal",
  );
});
