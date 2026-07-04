/**
 * M2 perf gates (M2-ACCEPTANCE.md "Perf gates"). Re-recorded post-M2 by slice
 * 2e as the closer (with everything merged). Wired as `test.todo` in 2a; B1-dirty
 * (2a) already asserts the warm all-source dirtyCheck bound that B7-dirty
 * re-records here.
 */
import { describe, test } from "vitest";

describe("acceptance: 2e perf gates", () => {
  test.todo(
    "B7-dirty: warm all-source dirtyCheck (now incl. code) <20ms dev / ×runner-factor CI (re-record with everything merged)",
  );
  test.todo(
    "B7-size: store size ceilings re-recorded with symbols in (non-regression vs observed M1 numbers; ⚠ record before/after)",
  );
  test.todo(
    "B7-parse: cold full-parse of this repo's packages/ TypeScript bounded + recorded; incremental re-parse after a 1-file edit touches only that file's symbols (+1-hop boundary)",
  );
});
