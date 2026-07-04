import { describe, expect, test } from "vitest";
import { CTX_CORE_SCAFFOLD } from "@ctx/core";

// Proves the @ctx/cli -> @ctx/core workspace link resolves in dev/test (no
// pre-build): the foundation contract (Store/SourceAdapter) will flow through
// this same import path in slice 1b.
describe("cli scaffolding", () => {
  test("resolves the @ctx/core workspace dependency", () => {
    expect(CTX_CORE_SCAFFOLD).toBe("m1-1a");
  });
});
