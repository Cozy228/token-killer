import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { join } from "node:path";
import { buildPushBlock, PUSH_MAX_BYTES, renderPushBlock } from "../../src/push/block.ts";
import { rankGotchas } from "../../src/push/rank.ts";
import type { GotchaCandidate } from "../../src/push/rank.ts";
import { remember } from "../../src/memory/remember.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { cleanupTempDir, makeGitFixture, makeTempDir } from "../helpers/sandbox.ts";

function gotcha(id: string, gist: string, score: number): GotchaCandidate {
  return {
    entityId: id,
    gist,
    handle: `m${id.slice(-5)}`,
    authority: "inferred",
    score,
    pinned: false,
  };
}

describe("push block: rendering", () => {
  test("empty gotchas → header-only block, no Gotchas label", () => {
    const block = renderPushBlock([]);
    expect(block.text).toContain("<!-- ctx:managed:begin -->");
    expect(block.text).toContain("<!-- ctx:managed:end -->");
    expect(block.text).not.toContain("Gotchas:");
    expect(block.rendered).toEqual([]);
    expect(block.bytes).toBeLessThanOrEqual(PUSH_MAX_BYTES);
  });

  test("renders gotchas one line each with [handle] under a Gotchas label", () => {
    const block = renderPushBlock([gotcha("mem:a", "alpha", 3), gotcha("mem:b", "bravo", 2)]);
    expect(block.text).toContain("Gotchas:");
    expect(block.text).toContain("⚠ alpha [");
    expect(block.text).toContain("⚠ bravo [");
    expect(block.handles.length).toBe(2);
    const lines = block.text.split("\n");
    expect(lines[0]).toBe("<!-- ctx:managed:begin -->");
    expect(lines[lines.length - 1]).toBe("<!-- ctx:managed:end -->");
  });

  test("readability cap limits gotcha lines even when budget allows more", () => {
    const many = Array.from({ length: 20 }, (_, i) => gotcha(`mem:${i}`, `g${i}`, 20 - i));
    const block = renderPushBlock(many); // default PUSH_MAX_GOTCHAS
    expect(block.rendered.length).toBe(6);
    expect(block.truncated).toBe(true);
  });

  test("byte budget drops a gotcha that would overflow (truncated flagged)", () => {
    const huge = "中".repeat(240); // 240 chars × 3 bytes = 720 bytes/line
    const block = renderPushBlock(
      [gotcha("mem:1", huge, 3), gotcha("mem:2", huge, 2), gotcha("mem:3", huge, 1)],
      10,
    );
    expect(block.bytes).toBeLessThanOrEqual(PUSH_MAX_BYTES);
    expect(block.truncated).toBe(true);
    expect(block.rendered.length).toBeLessThan(3);
  });
});

describe("push rank: determinism + reuse of selection primitives", () => {
  let root: string;
  let home: string;
  let store: Store;

  beforeEach(() => {
    root = makeTempDir("ctx-rank-");
    home = join(root, "contexa-home");
    const repo = makeGitFixture(root);
    // Fixed store clock so last_verified (and thus recency) is deterministic.
    store = openStore({ projectDir: repo, home, now: () => 1_600_000_000_000 });
  });
  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("confirmed authority outranks inferred at equal recency (authorityBoost reuse)", () => {
    const inferred = remember(store, {
      surface: "cli",
      note: "inferred fact",
      authority: "inferred",
    });
    const confirmed = remember(store, {
      surface: "cli",
      note: "confirmed fact",
      authority: "confirmed",
    });
    if (!inferred.ok || !confirmed.ok) throw new Error("seed failed");
    const ranked = rankGotchas(store, undefined, 1_600_000_000_000);
    expect(ranked[0]?.entityId).toBe(confirmed.entityId); // ×1.3 boost wins the tie
  });

  test("ranking is deterministic across calls (score desc, id asc)", () => {
    remember(store, { surface: "cli", note: "one" });
    remember(store, { surface: "cli", note: "two" });
    remember(store, { surface: "cli", note: "three" });
    const a = rankGotchas(store, undefined, 1_600_000_100_000).map((g) => g.entityId);
    const b = rankGotchas(store, undefined, 1_600_000_100_000).map((g) => g.entityId);
    expect(a).toEqual(b);
  });

  test("buildPushBlock handles round-trip via the store (G-5 spirit)", () => {
    const r = remember(store, { surface: "cli", note: "resolvable gotcha" });
    if (!r.ok) throw new Error("seed failed");
    const block = buildPushBlock(store, { now: 1_600_000_000_000 });
    expect(block.rendered.length).toBe(1);
    for (const g of block.rendered) {
      expect(store.resolveHandle(g.handle)?.entityId).toBe(g.entityId);
    }
  });
});
