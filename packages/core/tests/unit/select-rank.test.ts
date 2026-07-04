import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { openStore, type Store } from "../../src/store/store.ts";
import {
  confidenceFactor,
  decayBasis,
  heatBoost,
  historyHeat,
  rankOf,
  rrfFuse,
  timeDecay,
} from "../../src/select/rank.ts";
import { linkConfidence } from "../../src/select/subgraph.ts";
import {
  DECAY_WINDOW_MS,
  MEMORY_CONFIRMED_BOOST,
  PREDICATE_CONFIDENCE_FLOOR,
  RRF_K,
} from "../../src/select/constants.ts";
import { authorityBoost } from "../../src/select/rank.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

// §10: RRF fusion determinism + §6.3 post-multiplier unit behavior.

describe("select/rank: RRF fusion (K=60)", () => {
  test("fused score = Σ 1/(K + rank), 1-based ranks", () => {
    const fused = rrfFuse([
      ["a", "b", "c"],
      ["b", "a"],
    ]);
    expect(fused.get("a")!).toBeCloseTo(1 / (RRF_K + 1) + 1 / (RRF_K + 2), 12);
    expect(fused.get("b")!).toBeCloseTo(1 / (RRF_K + 2) + 1 / (RRF_K + 1), 12);
    expect(fused.get("c")!).toBeCloseTo(1 / (RRF_K + 3), 12);
  });

  test("deterministic: identical inputs → identical maps; ties break by id", () => {
    const a = rrfFuse([
      ["x", "y"],
      ["y", "x"],
    ]);
    const b = rrfFuse([
      ["x", "y"],
      ["y", "x"],
    ]);
    expect([...a.entries()]).toEqual([...b.entries()]);
    // x and y have symmetric ranks → equal scores → rankOf breaks by id asc
    expect(rankOf(a)).toEqual(["x", "y"]);
  });

  test("an id present in one list only still fuses", () => {
    const fused = rrfFuse([["solo"], []]);
    expect(fused.get("solo")!).toBeCloseTo(1 / (RRF_K + 1), 12);
  });
});

describe("select/rank: time decay + confidence + authority", () => {
  test("exp(-age/90d): 0d=1, 90d=1/e, future clamps to 1", () => {
    const now = 1_800_000_000_000;
    expect(timeDecay(now, now)).toBe(1);
    expect(timeDecay(now - DECAY_WINDOW_MS, now)).toBeCloseTo(1 / Math.E, 9);
    expect(timeDecay(now + 5000, now)).toBe(1);
  });

  test("confidence soft factor = 0.5 + 0.5·conf, clamped", () => {
    expect(confidenceFactor(1)).toBe(1);
    expect(confidenceFactor(0)).toBe(0.5);
    expect(confidenceFactor(0.5)).toBe(0.75);
    expect(confidenceFactor(7)).toBe(1);
  });

  test("per-predicate floors substitute a missing link confidence", () => {
    expect(linkConfidence({ predicate: "co-changed", confidence: Number.NaN })).toBe(
      PREDICATE_CONFIDENCE_FLOOR["co-changed"],
    );
    expect(linkConfidence({ predicate: "touches", confidence: 0.8 })).toBe(0.8);
    expect(linkConfidence({ predicate: "unknown-pred", confidence: 0 })).toBe(0.5);
  });
});

describe("select/rank: store-backed multipliers", () => {
  let root: string;
  let store: Store;
  const T0 = Date.UTC(2026, 6, 1); // fixed clock (§10)

  beforeAll(() => {
    root = makeTempDir("ctx-rank-");
    const project = join(root, "project");
    mkdirSync(project, { recursive: true });
    writeFileSync(join(project, "a.ts"), "export const a = 1;\n");
    store = openStore({ projectDir: project, home: join(root, "home"), now: () => T0 });

    store.upsertEntity({
      id: "mem:confirmed",
      kind: "memory",
      name: "confirmed note",
      locator: { t: "store" },
      gen: 1,
    });
    store.writeMemory({
      entityId: "mem:confirmed",
      gist: "confirmed note",
      origin: "remember",
      authority: "confirmed",
    });
    store.upsertEntity({
      id: "mem:inferred",
      kind: "memory",
      name: "inferred note",
      locator: { t: "store" },
      gen: 1,
    });
    store.writeMemory({
      entityId: "mem:inferred",
      gist: "inferred note",
      origin: "host-import:claude-code",
      authority: "inferred",
    });

    // file with two touches: one recent, one ancient
    store.upsertEntity({
      id: "file:a.ts",
      kind: "file",
      name: "a.ts",
      locator: { t: "file", path: "a.ts" },
      gen: 1,
    });
    const mkCommit = (id: string, iso: string): void => {
      store.upsertEntity({
        id,
        kind: "commit",
        name: `commit ${id}`,
        locator: { t: "git", oid: "0".repeat(40) },
        attrs: { date: iso },
        gen: 1,
      });
      store.setLink({ src: id, dst: "file:a.ts", predicate: "touches", method: "structural" });
    };
    mkCommit("commit:aaaaaaaaaaaa", new Date(T0 - 5 * 86_400_000).toISOString()); // 5d ago
    mkCommit("commit:bbbbbbbbbbbb", new Date(T0 - 400 * 86_400_000).toISOString()); // out of window
  });

  afterAll(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("memory authority boost: confirmed ×1.3, inferred ×1", () => {
    expect(authorityBoost(store, store.getEntity("mem:confirmed")!)).toBe(MEMORY_CONFIRMED_BOOST);
    expect(authorityBoost(store, store.getEntity("mem:inferred")!)).toBe(1);
  });

  test("memory decays from its newest anchoredTo claim", () => {
    const anchoredAt = T0 - 10 * 86_400_000;
    const anchored = openStore({
      projectDir: store.projectRoot,
      home: join(root, "home"),
      now: () => anchoredAt,
    });
    anchored.addClaim({
      subject: "mem:confirmed",
      predicate: "anchoredTo",
      object: "file:a.ts",
      carrier: "remember",
      method: "explicit-key",
      authority: "confirmed",
      gen: 1,
    });
    anchored.close();
    expect(decayBasis(store, store.getEntity("mem:confirmed")!)).toBe(anchoredAt);
    // unanchored memory falls back to last_verified
    expect(decayBasis(store, store.getEntity("mem:inferred")!)).toBe(T0);
  });

  test("code kinds have NO decay basis (never time-decay)", () => {
    expect(decayBasis(store, store.getEntity("file:a.ts")!)).toBeUndefined();
  });

  test("history heat: commits_90d + recency from touches; non-code kinds are 0", () => {
    const file = store.getEntity("file:a.ts")!;
    const heat = historyHeat(store, file, T0);
    // 1 commit in-window: freq = min(1/20,1)·0.7 = 0.035; recency = (1 - 5/90)·0.3
    const expected = (1 / 20) * 0.7 + (1 - (5 * 86_400_000) / DECAY_WINDOW_MS) * 0.3;
    expect(heat).toBeCloseTo(expected, 9);
    expect(heatBoost(store, file, T0)).toBeCloseTo(1 + 0.5 * expected, 9);
    expect(historyHeat(store, store.getEntity("mem:confirmed")!, T0)).toBe(0);
  });
});
