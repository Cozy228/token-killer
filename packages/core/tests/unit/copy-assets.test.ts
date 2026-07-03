import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
// @ts-expect-error — plain .mjs build helper, intentionally untyped (not in tsc include).
import { copyAssets } from "../../scripts/copy-assets.mjs";

// Exercises the copy-assets mechanism directly (no full tsdown build needed). The
// real build chains this same helper after tsdown; slice 1b's `.sql` migrations
// ride the identical path.
describe("copy-assets", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "ctx-copy-assets-"));
  });

  afterEach(() => {
    // Windows EBUSY hardening (memory: spawn/temp cleanup).
    rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });

  test("copies .sql/.scm/.wasm assets, mirroring the path under src", () => {
    const srcDir = join(root, "src");
    const outDir = join(root, "dist");
    mkdirSync(join(srcDir, "store", "schema"), { recursive: true });
    mkdirSync(join(srcDir, "extract", "queries"), { recursive: true });
    writeFileSync(join(srcDir, "store", "schema", "001-init.sql"), "SELECT 1;");
    writeFileSync(join(srcDir, "extract", "queries", "ts.scm"), "(identifier)");
    // A non-asset must be ignored.
    writeFileSync(join(srcDir, "store", "index.ts"), "export const x = 1;");

    const copied = copyAssets({ srcDir, outDir });

    expect(copied.sort()).toEqual(
      [join("store", "schema", "001-init.sql"), join("extract", "queries", "ts.scm")].sort(),
    );
    expect(readFileSync(join(outDir, "store", "schema", "001-init.sql"), "utf8")).toBe("SELECT 1;");
    expect(readFileSync(join(outDir, "extract", "queries", "ts.scm"), "utf8")).toBe("(identifier)");
  });

  test("returns an empty list when the src dir does not exist", () => {
    expect(copyAssets({ srcDir: join(root, "missing"), outDir: join(root, "dist") })).toEqual([]);
  });
});
