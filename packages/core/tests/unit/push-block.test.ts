import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { join } from "node:path";
import {
  BLOCK_BEGIN,
  BLOCK_END,
  buildPushBlock,
  HEADER_LINES,
  PUSH_MAX_BYTES,
  renderPushBlock,
} from "../../src/push/block.ts";
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

// DR-32 (use-blocking): the PLACED block (written into always-loaded host
// instruction files) must carry NO uncited factual gotchas and NO "with
// provenance" claim. Ranking (pin/veto) still runs — it now governs `wouldRender`
// (which notes WOULD return once each carries a full claim envelope), not what is
// placed into the host file.
describe("push block: placed block omits uncited factual gotchas (DR-32)", () => {
  test("header is de-claimed: no 'with provenance' claim; tool instruction stays", () => {
    expect(HEADER_LINES[0]).not.toContain("with provenance");
    expect(HEADER_LINES.join("\n")).toContain("`context` MCP tool"); // tool instruction stays
  });

  test("placed block OMITS the ⚠ gotcha lines even when ranked notes exist", () => {
    const block = renderPushBlock([gotcha("mem:a", "alpha", 3), gotcha("mem:b", "bravo", 2)]);
    expect(block.text).not.toContain("⚠"); // no uncited factual claim placed
    expect(block.text).not.toContain("Gotchas:");
    expect(block.text).not.toContain("[malpha]"); // no handle citation placed
    expect(block.rendered).toEqual([]);
    expect(block.handles).toEqual([]);
    // pin/veto ranking still governs which notes WOULD return (with a full envelope).
    expect(block.wouldRender.map((g) => g.entityId)).toEqual(["mem:a", "mem:b"]);
    expect(block.omittedGotchas).toBe(2);
    // explicit omission disclosure + non-claiming pointer to the cited surface.
    expect(block.text).toContain("omitted");
    expect(block.text).toContain("`context` MCP tool");
    expect(block.bytes).toBeLessThanOrEqual(PUSH_MAX_BYTES);
  });

  test("empty candidates → header-only block, no omission line, no Gotchas label", () => {
    const block = renderPushBlock([]);
    expect(block.text).toContain(BLOCK_BEGIN);
    expect(block.text).toContain(BLOCK_END);
    expect(block.text).not.toContain("Gotchas:");
    expect(block.text).not.toContain("omitted");
    expect(block.rendered).toEqual([]);
    expect(block.omittedGotchas).toBe(0);
    expect(block.bytes).toBeLessThanOrEqual(PUSH_MAX_BYTES);
  });

  test("readability cap governs wouldRender (which notes would return); nothing is placed", () => {
    const many = Array.from({ length: 20 }, (_, i) => gotcha(`mem:${i}`, `g${i}`, 20 - i));
    const block = renderPushBlock(many); // default PUSH_MAX_GOTCHAS
    expect(block.wouldRender.length).toBe(6);
    expect(block.rendered).toEqual([]); // still nothing factual placed
    expect(block.text).not.toContain("⚠");
  });
});

// DR-32: the `ctx push --local` DISPLAY view writes NO host file, so it may still
// SHOW the ranked gotchas locally. It opts in with `includeGotchas: true`, and the
// 1KB byte budget + readability cap still apply there.
describe("push block: --local display view still shows gotchas (DR-32)", () => {
  test("renders gotchas one line each with [handle] under a Gotchas label", () => {
    const block = renderPushBlock([gotcha("mem:a", "alpha", 3), gotcha("mem:b", "bravo", 2)], {
      includeGotchas: true,
    });
    expect(block.text).toContain("Gotchas:");
    expect(block.text).toContain("⚠ alpha [");
    expect(block.text).toContain("⚠ bravo [");
    expect(block.handles.length).toBe(2);
    expect(block.rendered.length).toBe(2);
    const lines = block.text.split("\n");
    expect(lines[0]).toBe(BLOCK_BEGIN);
    expect(lines[lines.length - 1]).toBe(BLOCK_END);
  });

  test("readability cap limits rendered lines even when budget allows more", () => {
    const many = Array.from({ length: 20 }, (_, i) => gotcha(`mem:${i}`, `g${i}`, 20 - i));
    const block = renderPushBlock(many, { includeGotchas: true }); // default PUSH_MAX_GOTCHAS
    expect(block.rendered.length).toBe(6);
    expect(block.truncated).toBe(true);
  });

  test("byte budget drops a gotcha that would overflow (truncated flagged)", () => {
    const huge = "中".repeat(240); // 240 chars × 3 bytes = 720 bytes/line
    const block = renderPushBlock(
      [gotcha("mem:1", huge, 3), gotcha("mem:2", huge, 2), gotcha("mem:3", huge, 1)],
      { includeGotchas: true, maxGotchas: 10 },
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

  test("DR-32: pins/vetoes govern wouldRender; the placed block still cites nothing", () => {
    const r = remember(store, { surface: "cli", note: "resolvable gotcha" });
    if (!r.ok) throw new Error("seed failed");
    const block = buildPushBlock(store, { now: 1_600_000_000_000 });
    // placed block cites nothing …
    expect(block.rendered.length).toBe(0);
    expect(block.text).not.toContain("⚠");
    // … but the would-return candidate is still tracked + resolvable (G-5 spirit).
    expect(block.wouldRender.length).toBe(1);
    for (const g of block.wouldRender) {
      expect(store.resolveHandle(g.handle)?.entityId).toBe(g.entityId);
    }
  });
});
