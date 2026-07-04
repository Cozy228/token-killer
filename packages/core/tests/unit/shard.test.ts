import { mkdirSync } from "node:fs";
import { join, sep } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ctxHome, resolveShard, SHARD_HEX_LEN, storePath } from "../../src/store/shard.ts";
import { cleanupTempDir, git, makeGitFixture, makeTempDir } from "../helpers/sandbox.ts";

describe("shard placement (worktree-aware, P28 addenda)", () => {
  let root: string;

  beforeEach(() => {
    root = makeTempDir("ctx-shard-");
  });
  afterEach(() => {
    cleanupTempDir(root);
  });

  test("git repo: shard is a 12-hex prefix keyed on the common dir", () => {
    const repo = makeGitFixture(root);
    const res = resolveShard(repo);
    expect(res.git).toBe(true);
    expect(res.shard).toMatch(new RegExp(`^[0-9a-f]{${SHARD_HEX_LEN}}$`));
    expect(res.projectRoot.endsWith(`${sep}repo`)).toBe(true);
    expect(res.mainRoot).toBe(res.projectRoot);
  });

  test("a subdirectory of the repo resolves the same shard", () => {
    const repo = makeGitFixture(root);
    const sub = join(repo, "src", "deep");
    mkdirSync(sub, { recursive: true });
    expect(resolveShard(sub).shard).toBe(resolveShard(repo).shard);
  });

  test("a git worktree resolves the SAME shard as the main checkout", () => {
    const repo = makeGitFixture(root);
    const wt = join(root, "wt");
    git(["worktree", "add", "-q", wt], repo);
    const main = resolveShard(repo);
    const worktree = resolveShard(wt);
    expect(worktree.shard).toBe(main.shard);
    // ...but read-through resolves against the CURRENT checkout root:
    expect(worktree.projectRoot).not.toBe(main.projectRoot);
    expect(worktree.mainRoot).toBe(main.mainRoot);
  });

  test("non-git dir: fallback shard keyed on realpath(project root)", () => {
    const plain = join(root, "plain");
    mkdirSync(plain);
    const res = resolveShard(plain);
    expect(res.git).toBe(false);
    expect(res.shard).toMatch(new RegExp(`^[0-9a-f]{${SHARD_HEX_LEN}}$`));
    expect(res.mainRoot).toBe(res.projectRoot);
  });

  test("two different projects get different shards", () => {
    const a = makeGitFixture(root);
    const bRoot = join(root, "other");
    mkdirSync(bRoot);
    expect(resolveShard(a).shard).not.toBe(resolveShard(bRoot).shard);
  });

  test("store path layout + CTX_HOME override", () => {
    expect(storePath("abc123def456", "/data/ctx")).toBe(
      join("/data/ctx", "projects", "abc123def456", "store.sqlite"),
    );
    expect(ctxHome({ CTX_HOME: "/custom" })).toBe("/custom");
    expect(ctxHome({})).toContain(".ctx");
  });
});
