import { describe, test } from "vitest";

// Perf gates (M1-ACCEPTANCE.md §"Perf gates") — record numbers, fail on
// regression. Measured on this repo (M-series + mid Windows box, CTX-IMPL §10).
describe("acceptance: perf gates", () => {
  test.todo("A11-dirty"); // warm dirtyCheck all-sources <20ms
  test.todo("A11-serve"); // warm context() end-to-end <150ms
  test.todo("A11-size"); // store size <5% of repo checkout size
});
