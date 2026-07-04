import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  buildPushBlock,
  importClaudeCodeMemory,
  PUSH_MAX_BYTES,
  placePushBlock,
  readPushConfig,
  remember,
  renderPushBlock,
  resolveClaudeMemoryDir,
  type GotchaCandidate,
} from "@ctx/core";
import { resolveShard } from "../../src/store/shard.ts";
import { openStore } from "../../src/store/store.ts";
import { cleanupTempDir, git, makeTempDir } from "../helpers/sandbox.ts";

// Slice 1h — Push (M1-ACCEPTANCE §1h). Two tiers (both required):
//  - living-repo tier: the block for THIS repo's real store (env-gated on the
//    live Claude Code memory dir), built in a temp CTX_HOME sandbox (G-7);
//  - fixture tier: the 1000-set budget property + a deterministic pin/veto/
//    idempotency store, both machine-independent.
const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO_ROOT = resolve(PKG_DIR, "../..");
const here = resolveShard(REPO_ROOT);
const MEMORY_DIR = resolveClaudeMemoryDir(process.env.HOME ?? "", [
  here.projectRoot,
  here.mainRoot,
]);

// Deterministic seeded PRNG (mulberry32) — repo convention, no Math.random.
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Char alphabet incl. multibyte glyphs: a 240-CHAR gist can be far more than 240
// BYTES, so the budget (a BYTE cap) must survive multibyte gists (⚠ é 中 😀).
const ALPHABET = "abcdefghij klmnop qrstuv éà 中文 ⚠ 😀 —";
function randGist(rand: () => number, maxChars: number): string {
  const n = 1 + Math.floor(rand() * maxChars);
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return s.slice(0, 240); // store gist char cap (§2)
}

function makeRepo(root: string): string {
  const repo = join(root, "repo");
  git(["init", "-q", "-b", "main", repo], root);
  git(["config", "user.email", "ctx@example.invalid"], repo);
  git(["config", "user.name", "ctx"], repo);
  writeFileSync(join(repo, "README.md"), "# fixture\n");
  git(["add", "README.md"], repo);
  git(["commit", "-q", "-m", "init"], repo);
  return repo;
}

describe("acceptance: 1h push", () => {
  let root: string;
  let home: string;

  beforeEach(() => {
    root = makeTempDir("ctx-a9-");
    home = join(root, "ctx-home"); // sandboxed CTX_HOME (G-7)
  });
  afterEach(() => {
    cleanupTempDir(root);
  });

  describe("A9-budget", () => {
    describe.skipIf(MEMORY_DIR === undefined)("living-repo tier (env-gated: live memory)", () => {
      test("the push block for THIS repo is ≤1KB and carries the fixed header", () => {
        const store = openStore({ projectDir: REPO_ROOT, home });
        importClaudeCodeMemory(store, { projectRoots: [here.projectRoot, here.mainRoot] });

        const block = buildPushBlock(store);
        expect(block.bytes).toBeLessThanOrEqual(PUSH_MAX_BYTES);
        expect(Buffer.byteLength(block.text, "utf8")).toBe(block.bytes);
        // Fixed 2-line header + sentinels always present.
        expect(block.text).toContain("<!-- ctx:managed:begin -->");
        expect(block.text).toContain("<!-- ctx:managed:end -->");
        expect(block.text).toContain("This project has a ctx context base");
        expect(block.text).toContain("Start tasks with the `context` MCP tool");
        // Real repo has 80+ memories → at least one gotcha surfaces.
        expect(block.rendered.length).toBeGreaterThan(0);
        // Every rendered handle round-trips (G-5 spirit).
        for (const g of block.rendered) {
          expect(store.resolveHandle(g.handle)?.entityId).toBe(g.entityId);
        }
        store.close();
      });
    });

    test("property: 1000 random memory sets never exceed 1KB", () => {
      for (let round = 0; round < 1000; round++) {
        const rand = rng(9000 + round);
        const n = 1 + Math.floor(rand() * 30);
        const gotchas: GotchaCandidate[] = [];
        for (let i = 0; i < n; i++) {
          gotchas.push({
            entityId: `mem:${round}-${i}`,
            gist: randGist(rand, 240),
            handle: `m${blakeish(rand)}`,
            authority: rand() < 0.5 ? "confirmed" : "inferred",
            score: rand(),
            pinned: false,
          });
        }
        // maxGotchas = n disables the readability cap: the BYTE budget is the
        // sole limiter, so this asserts the hard invariant, not the soft cap.
        const block = renderPushBlock(gotchas, n);
        expect(block.bytes, `round ${round} (${n} gotchas)`).toBeLessThanOrEqual(PUSH_MAX_BYTES);
        expect(Buffer.byteLength(block.text, "utf8")).toBe(block.bytes);
      }
    });
  });

  test("A9-pin-veto: a .ctx/push.jsonc pin forces in, veto keeps out, both survive re-render", () => {
    const repo = makeRepo(root);
    // Mutable injected clock → deterministic recency ranking (entity
    // last_verified is stamped by the STORE clock at write time).
    let clock = 1_000_000_000_000;
    const store = openStore({ projectDir: repo, home, now: () => clock });

    clock = 1_000_000_000_000; // oldest → lowest recency score
    const m1 = must(remember(store, { note: "alpha: oldest gotcha" }));
    clock = 1_000_000_100_000;
    const m2 = must(remember(store, { note: "bravo: middle gotcha" }));
    clock = 1_000_000_200_000; // newest → highest recency score
    const m3 = must(remember(store, { note: "charlie: newest gotcha" }));
    const NOW = 1_000_000_300_000;

    // Default top-2: newest two (m3, m2); m1 is cut, m3 is in.
    const base = buildPushBlock(store, { maxGotchas: 2, now: NOW });
    expect(base.handles).toContain(m3.handle);
    expect(base.handles).not.toContain(m1.handle);

    // A .ctx/push.jsonc (with comments) pins m1 and vetoes m3.
    const cfgPath = join(repo, ".ctx", "push.jsonc");
    mkdirSync(dirname(cfgPath), { recursive: true });
    writeFileSync(
      cfgPath,
      `{
  // force the oldest gotcha to always show
  "pin": ["${m1.handle}"],
  "veto": ["${m3.handle}"]
}
`,
    );
    const cfg = readPushConfig(repo);
    expect(cfg.ok).toBe(true);

    const pinned = buildPushBlock(store, { config: cfg, maxGotchas: 2, now: NOW });
    expect(pinned.handles).toContain(m1.handle); // pin forced it in
    expect(pinned.handles).not.toContain(m3.handle); // veto kept it out
    expect(pinned.handles[0]).toBe(m1.handle); // pins render first
    expect(pinned.handles).toContain(m2.handle); // auto-fill kept the un-vetoed middle

    // Both survive a re-render (deterministic, byte-identical).
    const again = buildPushBlock(store, { config: cfg, maxGotchas: 2, now: NOW });
    expect(again.text).toBe(pinned.text);
    store.close();
  });

  test("A9-idempotent: unchanged inputs → byte-identical block; placement is a no-op with surrounds preserved", () => {
    const repo = makeRepo(root);
    let clock = 1_700_000_000_000;
    const store = openStore({ projectDir: repo, home, now: () => clock });
    clock = 1_700_000_000_000;
    must(remember(store, { note: "retry queue drops metadata on redelivery" }));
    clock = 1_700_000_050_000;
    must(remember(store, { note: "shard key hashes the git-common-dir realpath" }));
    const NOW = 1_700_000_100_000;

    const a = buildPushBlock(store, { now: NOW });
    const b = buildPushBlock(store, { now: NOW });
    expect(b.text).toBe(a.text); // byte-identical re-render (no-op guard input)

    // Placement into a file with surrounding content AND a pre-existing managed
    // block: only the block region changes; every surrounding byte is preserved.
    const agents = join(repo, "AGENTS.md");
    const preamble = "# Agents\n\nHand-written project guidance.\n\n";
    const stale = "<!-- ctx:managed:begin -->\nstale block\n<!-- ctx:managed:end -->";
    const tail = "\n\n## Conventions\n\nUse pnpm.\n";
    writeFileSync(agents, preamble + stale + tail);

    const first = placePushBlock(repo, a.text, { targets: ["AGENTS.md"] });
    expect(first[0]?.changed).toBe(true);
    const afterFirst = readFileSync(agents, "utf8");
    expect(afterFirst).toBe(preamble + a.text + tail); // surrounds byte-preserved
    expect(afterFirst.startsWith(preamble)).toBe(true);
    expect(afterFirst.endsWith(tail)).toBe(true);

    // Re-place identical block → no-op (changed:false), file byte-identical.
    const second = placePushBlock(repo, a.text, { targets: ["AGENTS.md"] });
    expect(second[0]?.changed).toBe(false);
    expect(readFileSync(agents, "utf8")).toBe(afterFirst);

    // A fresh file (absent) is created containing exactly the block + newline.
    const claude = join(repo, "CLAUDE.md");
    expect(existsSync(claude)).toBe(false);
    const created = placePushBlock(repo, a.text, { targets: ["CLAUDE.md"] });
    expect(created[0]?.created).toBe(true);
    expect(readFileSync(claude, "utf8")).toBe(`${a.text}\n`);
    store.close();
  });
});

function must<T extends { ok: boolean }>(r: T): Extract<T, { ok: true }> {
  if (!r.ok) throw new Error(`expected ok result, got ${JSON.stringify(r)}`);
  return r as Extract<T, { ok: true }>;
}

// A short pseudo-handle body (6 hex-ish chars) for the pure-render property.
function blakeish(rand: () => number): string {
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 5; i++) s += hex[Math.floor(rand() * 16)];
  return s;
}
