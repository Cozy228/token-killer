import { describe, test } from "vitest";

// Slice 1c — Memory source. Flipped green by the 1c implementer.
// A1-import is env-gated: requires ~/.claude/projects/<this-shard>/memory/
// (wire via describe.skipIf when implemented). Its entity-count floor is a
// ⚠ verify-at-wiring value.
describe("acceptance: 1c memory source", () => {
  test.todo("A1-import"); // env-gated (host memory dir) + ⚠ verify entity count floor
  test.todo("A1-echo");
  test.todo("A2-remember");
  test.todo("A2-supersede");
});
