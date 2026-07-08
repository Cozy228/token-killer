import { describe, expect, test } from "vitest";
import { CTX_CORE_SCAFFOLD } from "@contexa/core";

// Proves the @contexa/cli -> @contexa/core workspace link resolves in dev/test (no
// pre-build): the foundation contract (Store/SourceAdapter) will flow through
// this same import path in slice 1b.
describe("cli scaffolding", () => {
  test("resolves the @contexa/core workspace dependency", () => {
    expect(CTX_CORE_SCAFFOLD).toBe("m1-1a");
  });
});
