import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { openStore, type Store } from "../../src/store/store.ts";
import type { Entity } from "../../src/store/types.ts";
import {
  assembleSections,
  sectionBudgets,
  sectionOf,
  totalBudgetTokens,
  type ConflictCandidate,
  type RankedCandidate,
} from "../../src/select/sections.ts";
import { estimateTokens, renderAtTier, renderWithinBudget } from "../../src/select/project.ts";
import { LEAN_TOTAL_TOKENS, SECTION_SHARE, WIDE_MULTIPLIER } from "../../src/select/constants.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

// §10 at this layer: "budget never exceeded" + "omission counts reconcile"
// (typed-struct level, P28 addendum) + §6.4 borrowing arithmetic + §6.5 tiers.

let root: string;
let store: Store;
let seq = 0;

/** Deterministic memory-backed entity with a gist of ~`words` words. */
function memEntity(words: number, opts: { detailWords?: number; name?: string } = {}): Entity {
  const id = `mem:fx${String(++seq).padStart(4, "0")}`;
  const gist = Array.from({ length: words }, (_, i) => `word${i % 7}`)
    .join(" ")
    .slice(0, 240);
  store.upsertEntity({
    id,
    kind: "memory",
    name: opts.name ?? gist.slice(0, 40),
    locator: { t: "store" },
    gen: 1,
  });
  store.writeMemory({
    entityId: id,
    gist,
    ...(opts.detailWords
      ? { detail: Array.from({ length: opts.detailWords }, (_, i) => `detail${i % 5}`).join(" ") }
      : {}),
    origin: "remember",
    authority: "inferred",
  });
  return store.getEntity(id)!;
}

function docEntity(path: string, lines: string[], span?: [number, number]): Entity {
  const id = `doc:${path}#s${++seq}`;
  store.upsertEntity({
    id,
    kind: "doc_section",
    name: `section ${seq}`,
    locator: { t: "file", path, ...(span ? { span } : {}) },
    gen: 1,
  });
  void lines;
  return store.getEntity(id)!;
}

beforeAll(() => {
  root = makeTempDir("ctx-sections-");
  const project = join(root, "project");
  mkdirSync(project, { recursive: true });
  const docLines = [
    "# Heading",
    "First content line of the section.",
    "",
    ...Array.from({ length: 60 }, (_, i) => `Body line ${i} with some words in it.`),
  ];
  writeFileSync(join(project, "doc.md"), docLines.join("\n") + "\n");
  store = openStore({
    projectDir: project,
    home: join(root, "home"),
    now: () => Date.UTC(2026, 6, 1),
  });
});

afterAll(() => {
  store.close();
  cleanupTempDir(root);
});

describe("select/sections: budgets", () => {
  test("lean caps = share × 1200; wide = 3× lean, same percentages (P28)", () => {
    const lean = sectionBudgets("lean");
    const wide = sectionBudgets("wide");
    expect(totalBudgetTokens("lean")).toBe(LEAN_TOTAL_TOKENS);
    expect(totalBudgetTokens("wide")).toBe(LEAN_TOTAL_TOKENS * WIDE_MULTIPLIER);
    for (const [name, share] of Object.entries(SECTION_SHARE)) {
      expect(lean[name as keyof typeof lean]).toBe(Math.floor(LEAN_TOTAL_TOKENS * share));
      expect(wide[name as keyof typeof wide]).toBe(
        Math.floor(LEAN_TOTAL_TOKENS * WIDE_MULTIPLIER * share),
      );
    }
    const shareSum = Object.values(SECTION_SHARE).reduce((a, b) => a + b, 0);
    expect(shareSum).toBeCloseTo(1, 12);
  });

  test("kind → section buckets", () => {
    expect(sectionOf("file")).toBe("code");
    expect(sectionOf("symbol")).toBe("code");
    expect(sectionOf("decision")).toBe("decisions");
    expect(sectionOf("doc_section")).toBe("decisions");
    expect(sectionOf("concept")).toBe("decisions");
    expect(sectionOf("commit")).toBe("history");
    expect(sectionOf("memory")).toBe("memory");
  });
});

describe("select/projection: render tiers (§6.5)", () => {
  test("tier-cut boundaries: full → skeleton → line as the budget shrinks", () => {
    const doc = docEntity("doc.md", [], [1, 62]);
    const handle = store.internHandle(doc.id);
    const full = renderWithinBudget(store, doc, handle, "full", 100_000);
    expect(full?.tier).toBe("full");
    const skeleton = renderWithinBudget(store, doc, handle, "full", full!.tokens - 1);
    expect(skeleton?.tier).toBe("skeleton");
    expect(skeleton!.text).toContain("First content line"); // first doc-comment-ish line
    const line = renderWithinBudget(store, doc, handle, "full", skeleton!.tokens - 1);
    expect(line?.tier).toBe("line");
    expect(line!.text).toContain(`[${handle}]`); // handle'd, always
    const nothing = renderWithinBudget(store, doc, handle, "full", 0);
    expect(nothing).toBeUndefined(); // → omission (counted + handle'd upstream)
  });

  test("summary-smaller-than-original: a skeleton that isn't smaller yields to the original", () => {
    // One-line section: its skeleton (line + indented gist) is not smaller than
    // the full render, so even at maxTier=skeleton the ORIGINAL is included.
    const tiny = docEntity("doc.md", [], [2, 2]);
    const handle = store.internHandle(tiny.id);
    const full = renderAtTier(store, tiny, handle, "full");
    const skeleton = renderAtTier(store, tiny, handle, "skeleton");
    expect(skeleton.tokens).toBeGreaterThanOrEqual(full.tokens); // fixture precondition
    const chosen = renderWithinBudget(store, tiny, handle, "skeleton", 100_000);
    expect(chosen!.tier).toBe("full");
    expect(chosen!.tokens).toBeLessThanOrEqual(skeleton.tokens);
  });

  test("memory renders from the store row (gist / gist+detail)", () => {
    const m = memEntity(12, { detailWords: 30 });
    const handle = store.internHandle(m.id);
    expect(renderAtTier(store, m, handle, "skeleton").text).toContain("word0");
    const full = renderAtTier(store, m, handle, "full");
    expect(full.text).toContain("detail0");
    expect(full.tokens).toBe(estimateTokens(full.text));
  });
});

describe("select/sections: assembly + borrowing (§6.4)", () => {
  test("omission counts reconcile + budget never exceeded (structured fixture)", () => {
    const candidates: RankedCandidate[] = [];
    for (let i = 0; i < 40; i++) candidates.push({ entity: memEntity(30), score: 40 - i });
    const { sections, envelope } = assembleSections(store, undefined, candidates, [], "lean");

    for (const s of sections) {
      expect(s.considered).toBe(s.items.length + s.omitted.length);
      for (const o of s.omitted) expect(o.handle.length).toBeGreaterThan(0);
    }
    expect(envelope.omittedTotal).toBe(sections.reduce((n, s) => n + s.omitted.length, 0));
    expect(envelope.usedTokens).toBe(sections.reduce((n, s) => n + s.usedTokens, 0));
    // budget never exceeded: rendered tokens ≤ total minus the envelope reserve
    expect(envelope.usedTokens).toBeLessThanOrEqual(
      envelope.totalBudgetTokens - envelope.envelopeReserveTokens,
    );
    expect(envelope.truncated).toBe(envelope.omittedTotal > 0);
  });

  test("borrowing arithmetic: unused section budget flows to the highest-scored omitted item", () => {
    // Only memory candidates → subject/code/decisions/history/conflicts caps are
    // all unused pool. Memory cap alone (10% of 1200 = 120 tokens) fits ~3 of
    // these ~40-token items; with borrowing the pool admits the rest.
    const candidates: RankedCandidate[] = Array.from({ length: 8 }, (_, i) => ({
      entity: memEntity(30),
      score: 8 - i,
    }));
    const { sections, envelope } = assembleSections(store, undefined, candidates, [], "lean");
    const memory = sections.find((s) => s.name === "memory")!;
    expect(memory.usedTokens).toBeGreaterThan(memory.budgetTokens); // borrowed
    expect(memory.items.length).toBe(8);
    expect(memory.omitted.length).toBe(0);
    expect(envelope.usedTokens).toBeLessThanOrEqual(
      envelope.totalBudgetTokens - envelope.envelopeReserveTokens,
    );
  });

  test("items render best-first; omitted are the lowest-scored", () => {
    const candidates: RankedCandidate[] = Array.from({ length: 60 }, (_, i) => ({
      entity: memEntity(35),
      score: 60 - i,
    }));
    const { sections } = assembleSections(store, undefined, candidates, [], "lean");
    const memory = sections.find((s) => s.name === "memory")!;
    expect(memory.omitted.length).toBeGreaterThan(0);
    const minRendered = Math.min(...memory.items.map((i) => i.score));
    const maxOmitted = Math.max(...memory.omitted.map((o) => o.score));
    expect(minRendered).toBeGreaterThanOrEqual(maxOmitted);
  });

  test("conflicts are never squeezed: they preempt other sections' borrowing", () => {
    // Fill memory far past every budget so leftovers compete for the pool with
    // HIGHER scores than the conflicts — conflicts must still all render.
    const candidates: RankedCandidate[] = Array.from({ length: 80 }, (_, i) => ({
      entity: memEntity(35),
      score: 1000 - i,
    }));
    const conflicts: ConflictCandidate[] = Array.from({ length: 8 }, (_, i) => {
      const subject = memEntity(6, { name: `conflict subject ${i}` });
      return {
        subject,
        text: `stale-suspect: conflict subject ${i} mentions gone.md (never-resolved) [h${i}]`,
        score: 0.001, // far below every memory candidate
      };
    });
    const { sections, envelope } = assembleSections(
      store,
      undefined,
      candidates,
      conflicts,
      "lean",
    );
    const conflictSection = sections.find((s) => s.name === "conflicts")!;
    expect(conflictSection.items.length).toBe(8);
    expect(conflictSection.omitted.length).toBe(0);
    expect(envelope.usedTokens).toBeLessThanOrEqual(
      envelope.totalBudgetTokens - envelope.envelopeReserveTokens,
    );
  });

  test("subject renders first, full-tier, and never double-renders in its bucket", () => {
    const subject = memEntity(20, { name: "the subject" });
    const candidates: RankedCandidate[] = [
      { entity: subject, score: 5 },
      { entity: memEntity(20), score: 4 },
    ];
    const { sections } = assembleSections(store, subject, candidates, [], "lean");
    const subjectSection = sections.find((s) => s.name === "subject")!;
    const memorySection = sections.find((s) => s.name === "memory")!;
    expect(subjectSection.items).toHaveLength(1);
    expect(subjectSection.items[0]!.entityId).toBe(subject.id);
    expect(memorySection.items.map((i) => i.entityId)).not.toContain(subject.id);
  });
});

describe("select/sections: §10 randomized properties", () => {
  // Deterministic seeded PRNG (mulberry32) — reproducible property sweep.
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

  test("budget never exceeded + omission counts reconcile across 25 random mixes", () => {
    for (let round = 0; round < 25; round++) {
      const rand = rng(1000 + round);
      const n = 5 + Math.floor(rand() * 70);
      const candidates: RankedCandidate[] = [];
      for (let i = 0; i < n; i++) {
        candidates.push({
          entity: memEntity(3 + Math.floor(rand() * 45), (rand() < 0.3 ? { detailWords: Math.floor(rand() * 80) } : {})),
          score: rand() * 100,
        });
      }
      const tier = rand() < 0.5 ? "lean" : "wide";
      const { sections, envelope } = assembleSections(store, undefined, candidates, [], tier);

      expect(envelope.usedTokens).toBeLessThanOrEqual(
        envelope.totalBudgetTokens - envelope.envelopeReserveTokens,
      );
      let omitted = 0;
      let used = 0;
      for (const s of sections) {
        expect(s.considered).toBe(s.items.length + s.omitted.length);
        for (const o of s.omitted) expect(o.handle.length).toBeGreaterThan(0);
        for (const item of s.items) {
          expect(item.tokens).toBe(estimateTokens(item.text));
          expect(item.handle.length).toBeGreaterThan(0);
        }
        omitted += s.omitted.length;
        used += s.usedTokens;
      }
      expect(envelope.omittedTotal).toBe(omitted);
      expect(envelope.usedTokens).toBe(used);
      // every candidate accounted for exactly once (rendered XOR omitted)
      const accounted = sections.reduce((k, s) => k + s.items.length + s.omitted.length, 0);
      expect(accounted).toBe(n);
    }
  });
});
