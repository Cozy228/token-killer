/**
 * Unit coverage for the shared-scan cache (CONTEXA-IMPL §4.2). Docs (1e) and code
 * (2a) share ONE `git ls-files` spawn per refresh cycle — the cache is what
 * keeps the warm all-source dirtyCheck under the 20ms A11 bar.
 */
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { clearScanCache, gitVisibleSet, scanSourceFiles } from "../../src/ingest/scan.ts";
import { CODE_EXTENSIONS } from "../../src/extract/code/languages.ts";
import { cleanupTempDir, makeTempDir, git } from "../helpers/sandbox.ts";

describe("shared source scan", () => {
  let repo: string;
  beforeEach(() => {
    repo = makeTempDir("ctx-scan-");
    git(["init", "-q", "-b", "main", repo], repo);
    git(["config", "user.email", "s@x.invalid"], repo);
    git(["config", "user.name", "s"], repo);
    clearScanCache();
  });
  afterEach(() => cleanupTempDir(repo));

  test("git ls-files fast path lists tracked + untracked-not-ignored code files", async () => {
    writeFileSync(join(repo, "a.ts"), "export const a = 1;\n");
    writeFileSync(join(repo, "b.py"), "x = 1\n");
    writeFileSync(join(repo, ".gitignore"), "ignored.ts\n");
    writeFileSync(join(repo, "ignored.ts"), "export const z = 1;\n");
    git(["add", "a.ts", "b.py", ".gitignore"], repo);
    const files = await scanSourceFiles(repo, CODE_EXTENSIONS);
    const paths = files.map((f) => f.path);
    expect(paths).toContain("a.ts");
    expect(paths).toContain("b.py");
    expect(paths, ".gitignore honored — ignored.ts excluded").not.toContain("ignored.ts");
  });

  test("cache dedups within the TTL; clearScanCache forces a fresh scan", () => {
    writeFileSync(join(repo, "a.ts"), "export const a = 1;\n");
    git(["add", "a.ts"], repo);
    const first = gitVisibleSet(repo);
    expect(first?.has("a.ts")).toBe(true);

    // Add a file WITHOUT clearing — the cached list does not see it yet.
    writeFileSync(join(repo, "b.ts"), "export const b = 2;\n");
    const cached = gitVisibleSet(repo);
    expect(cached?.has("b.ts"), "within TTL the cached list is reused").toBe(false);

    // Clearing forces a fresh spawn that sees the new file.
    clearScanCache();
    const fresh = gitVisibleSet(repo);
    expect(fresh?.has("b.ts")).toBe(true);
  });

  test("returns undefined outside a git work tree (recursive fallback path)", () => {
    const plain = makeTempDir("ctx-nogit-");
    try {
      clearScanCache();
      // A non-git dir → no ls-files list; scanSourceFiles falls back to a walk.
      expect(gitVisibleSet(plain)).toBeUndefined();
    } finally {
      cleanupTempDir(plain);
    }
  });

  // Keep the import used even if the platform lacks git in PATH (skip-safe).
  test("environment has git", () => {
    expect(() => execFileSync("git", ["--version"], { stdio: "ignore" })).not.toThrow();
  });
});
