/**
 * Slice 2b — Symbol-level touches + history (M2-ACCEPTANCE.md "2b"). Wired as
 * `test.todo` in 2a (acceptance-first); the slice that owns 2b flips them green.
 */
import { describe, test } from "vitest";

describe("acceptance: 2b symbol-level touches + history", () => {
  test.todo(
    "B2-touches: git --unified=0 hunk ranges join post-image symbol spans → commit --touches--> sym: links; file-level fallback for files without symbols (⚠ real M1-era commit + symbol)",
  );
  test.todo(
    "B2-history: context(ref:'sym:…') history lists commits that touched THAT symbol, not the whole file; rename chains keep pre-rename history reachable",
  );
});
