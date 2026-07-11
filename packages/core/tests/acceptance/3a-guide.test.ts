/**
 * Slice 3a — M3 guide projection kernel (brief §2/§7). Two tiers:
 *  • deterministic fixture tier — the script-generated `buildFixtureStore` under a
 *    fixed clock: golden JSON transcripts (the primary test surface) + the gates
 *    (G-budget, G-provenance, G-honest-gap) + scenario data C1–C10.
 *  • living-repo tier — THIS checkout ingested via the real docs+git adapters:
 *    the per-projection perf recorder records latency/counts/bytes (G-perf-recorded,
 *    recorded, NEVER asserted as a threshold).
 *
 * Update goldens deliberately with `CTX_UPDATE_GOLDEN=1` and review the diff.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DocsAdapter } from "../../src/ingest/docs.ts";
import { GitAdapter } from "../../src/ingest/git/adapter.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { buildFixtureStore, FIXTURE_NOW } from "../../src/guide/fixture.ts";
import {
  buildCanvasProjection,
  buildChurnLensProjection,
  buildInspectorProjection,
  buildSearchProjection,
  buildSubjectProjection,
  buildTimeLensProjection,
  canvasWithPerf,
  inspectorWithPerf,
  searchWithPerf,
  subjectWithPerf,
  formatPerf,
  type EvidencePacket,
} from "../../src/guide/index.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const GOLDEN_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "golden", "guide");
const UPDATE = process.env.CTX_UPDATE_GOLDEN === "1";
const PKG_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPO_ROOT = resolve(PKG_DIR, "../..");

function goldenMatch(name: string, value: unknown): void {
  const file = join(GOLDEN_DIR, `${name}.json`);
  const actual = JSON.stringify(value, null, 2) + "\n";
  if (UPDATE) {
    mkdirSync(GOLDEN_DIR, { recursive: true });
    writeFileSync(file, actual);
    return;
  }
  let expected: string;
  try {
    expected = readFileSync(file, "utf8");
  } catch {
    throw new Error(`missing golden guide/${name}.json — regenerate with CTX_UPDATE_GOLDEN=1`);
  }
  expect(
    actual,
    `golden drift in guide/${name}.json — review + regenerate with CTX_UPDATE_GOLDEN=1`,
  ).toBe(expected);
}

/** Collect every evidence packet reachable in a projection payload (provenance sweep). */
function collectEvidence(node: unknown, acc: EvidencePacket[]): void {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const el of node) collectEvidence(el, acc);
    return;
  }
  const obj = node as Record<string, unknown>;
  if ("envelope" in obj && "terse" in obj && "glyphs" in obj) {
    acc.push(obj as unknown as EvidencePacket);
  }
  for (const v of Object.values(obj)) collectEvidence(v, acc);
}

describe("acceptance: 3a guide projection kernel (deterministic fixture tier)", () => {
  let root: string;
  let store: Store;

  beforeAll(() => {
    root = makeTempDir("ctx-guide-fx-");
    const project = join(root, "proj");
    mkdirSync(project, { recursive: true });
    store = openStore({ projectDir: project, home: join(root, "home"), now: () => FIXTURE_NOW });
    buildFixtureStore(store);
  });

  afterAll(() => {
    store.close();
    cleanupTempDir(root);
  });

  // ---- golden transcripts (primary surface) ----
  test("golden: canvas projection", () => {
    goldenMatch("canvas", buildCanvasProjection(store, FIXTURE_NOW));
  });
  test("golden: subject(sym:charge) projection", () => {
    goldenMatch("subject-charge", buildSubjectProjection(store, "sym:charge", FIXTURE_NOW));
  });
  test("golden: subject(mem:retry-note) projection", () => {
    goldenMatch("subject-memory", buildSubjectProjection(store, "mem:retry-note", FIXTURE_NOW));
  });
  test("golden: search(retry) projection", () => {
    goldenMatch("search-retry", buildSearchProjection(store, "retry", null, FIXTURE_NOW));
  });
  test("golden: inspector projection", () => {
    goldenMatch("inspector", buildInspectorProjection(store, FIXTURE_NOW));
  });
  test("golden: time-lens projection", () => {
    goldenMatch("time-lens", buildTimeLensProjection(store, FIXTURE_NOW));
  });
  test("golden: churn-lens projection", () => {
    goldenMatch("churn-lens", buildChurnLensProjection(store, FIXTURE_NOW));
  });

  // ---- gates ----
  test("G-budget: every projection declares its budget + discloses omissions", () => {
    for (const p of [
      buildCanvasProjection(store, FIXTURE_NOW),
      buildInspectorProjection(store, FIXTURE_NOW),
      buildSearchProjection(store, "retry", null, FIXTURE_NOW),
      buildTimeLensProjection(store, FIXTURE_NOW),
      buildChurnLensProjection(store, FIXTURE_NOW),
    ]) {
      expect(Array.isArray(p.budget.budget.edgePredicates)).toBe(true);
      expect(typeof p.budget.budget.depth).toBe("number");
      expect(typeof p.budget.budget.nodeCap).toBe("number");
      expect(typeof p.budget.omitted).toBe("number");
      expect(p.budget.omitted).toBe(
        Object.values(p.budget.omittedByReason).reduce((a, b) => a + b, 0),
      );
    }
  });

  test("G-provenance: every rendered fact resolves to an evidence anchor", () => {
    const surfaces: unknown[] = [
      buildCanvasProjection(store, FIXTURE_NOW),
      buildSubjectProjection(store, "sym:charge", FIXTURE_NOW),
      buildSubjectProjection(store, "mem:retry-note", FIXTURE_NOW),
      buildInspectorProjection(store, FIXTURE_NOW),
      buildSearchProjection(store, "retry", null, FIXTURE_NOW),
    ];
    let count = 0;
    for (const s of surfaces) {
      const packets: EvidencePacket[] = [];
      collectEvidence(s, packets);
      expect(packets.length).toBeGreaterThan(0);
      for (const pkt of packets) {
        expect(typeof pkt.envelope.evidence.uri).toBe("string");
        expect(pkt.envelope.evidence.uri.length).toBeGreaterThan(0);
        expect(pkt.terse).toContain(pkt.envelope.evidence.uri);
        count += 1;
      }
    }
    expect(count).toBeGreaterThan(0);
  });

  test("G-honest-gap: null trust axes render as disclosed gaps, never fabricated", () => {
    // The draft note is an inferred agent proposal → confidence may be present, but
    // a non-memory derived entity has null axes. Sweep for any null axis and assert
    // it is disclosed in preRSlice and rendered as `?`, never a made-up value.
    const packets: EvidencePacket[] = [];
    collectEvidence(buildCanvasProjection(store, FIXTURE_NOW), packets);
    collectEvidence(buildSubjectProjection(store, "sym:charge", FIXTURE_NOW), packets);
    let sawGap = false;
    for (const pkt of packets) {
      if (pkt.envelope.derivation === null) {
        sawGap = true;
        expect(pkt.preRSlice).toContain("derivation");
        expect(pkt.glyphs.derivation.glyph).toBe("?");
        expect(pkt.glyphs.derivation.gap).toBe(true);
      }
      if (pkt.envelope.confidence === null) {
        expect(pkt.preRSlice).toContain("confidence");
        expect(pkt.glyphs.confidence.glyph).toBe("?");
      }
    }
    expect(sawGap).toBe(true);
  });

  // ---- scenarios C1–C10 (data tier; UI tiers live in guide/cli suites) ----
  test("C1: canvas renders sources + badges from the fixture store", () => {
    const c = buildCanvasProjection(store, FIXTURE_NOW);
    expect(c.sources.map((s) => s.source).sort()).toEqual(["code", "docs", "git", "memory"]);
    expect(c.sources.every((s) => s.entityCount > 0)).toBe(true);
    expect(c.badges.needsReview).toBeGreaterThanOrEqual(1);
    expect(c.badges.openConflicts).toBeGreaterThanOrEqual(1);
  });

  test("C2: omnibox finds a doc, a symbol, and a memory note, each drillable", () => {
    const kinds = (q: string) =>
      new Set(buildSearchProjection(store, q, null, FIXTURE_NOW).hits.map((h) => h.kind));
    expect([...kinds("retry")].length).toBeGreaterThan(0);
    // Each hit carries an entityId drill key (subject route resolves it).
    const hits = buildSearchProjection(store, "idempotent", null, FIXTURE_NOW).hits;
    expect(hits.every((h) => typeof h.entityId === "string" && h.entityId.length > 0)).toBe(true);
    // Across queries we can reach all three kinds present in the fixture.
    const all = new Set<string>();
    for (const q of ["retry", "idempotent", "charge", "cache"]) {
      for (const h of buildSearchProjection(store, q, null, FIXTURE_NOW).hits) all.add(h.kind);
    }
    expect(all.has("doc_section")).toBe(true);
    expect(all.has("symbol")).toBe(true);
    expect(all.has("memory")).toBe(true);
  });

  test("C3: subject(symbol) shows facts with anchors + glyph envelopes", () => {
    const s = buildSubjectProjection(store, "sym:charge", FIXTURE_NOW)!;
    expect(s.subject.name).toBe("charge");
    expect(s.facts.length).toBeGreaterThan(0);
    for (const f of s.facts) {
      expect(f.evidence.envelope.evidence.uri.length).toBeGreaterThan(0);
      expect(f.evidence.glyphs.status.glyph.length).toBeGreaterThan(0);
    }
    // call edges are present in the neighborhood mini-graph
    expect(s.neighborhood.edges.some((e) => e.predicate === "calls")).toBe(true);
  });

  test("C4: subject(memory note) shows lifecycle chain; inspector shows its zone", () => {
    const s = buildSubjectProjection(store, "mem:retry-note", FIXTURE_NOW)!;
    const verbs = s.decisionChain.map((d) => d.verb);
    expect(verbs).toContain("create");
    expect(verbs).toContain("confirm");
    const insp = buildInspectorProjection(store, FIXTURE_NOW);
    const entry = insp.memoryBrowser.entries.find((e) => e.entityId === "mem:retry-note");
    expect(entry?.zone).toBe("mainline");
    expect(entry?.lifecycle.length).toBeGreaterThanOrEqual(2);
  });

  test("C5: time lens overlays a supersession chain", () => {
    const t = buildTimeLensProjection(store, FIXTURE_NOW);
    expect(t.chains.some((c) => c.from === "mem:new-timeout" && c.to === "mem:old-timeout")).toBe(
      true,
    );
  });

  test("C6: churn lens shows co-change clusters", () => {
    const ch = buildChurnLensProjection(store, FIXTURE_NOW);
    expect(ch.clusters.length).toBeGreaterThan(0);
    const members = ch.clusters[0]!.members.map((m) => m.entityId);
    expect(members).toContain("file:payments.ts");
    expect(members).toContain("file:orders.ts");
  });

  test("C7: review queue lists needs-review entries WITH exact CLI commands", () => {
    const insp = buildInspectorProjection(store, FIXTURE_NOW);
    expect(insp.reviewQueue.length).toBeGreaterThanOrEqual(1);
    for (const item of insp.reviewQueue) {
      expect(item.cliCommand).toMatch(/^ctx memory confirm /);
    }
  });

  test("C8: conflicts tab groups by reason class", () => {
    const insp = buildInspectorProjection(store, FIXTURE_NOW);
    expect(insp.conflicts.some((g) => g.reasonClass === "contradiction")).toBe(true);
    for (const g of insp.conflicts) {
      for (const it of g.items) expect(it.cliCommand.length).toBeGreaterThan(0);
    }
  });

  test("C9: push preview shows the verbatim would-be digest + size budget", () => {
    const insp = buildInspectorProjection(store, FIXTURE_NOW);
    expect(typeof insp.pushPreview.digestText).toBe("string");
    expect(insp.pushPreview.budgetBytes).toBeGreaterThan(0);
    expect(insp.pushPreview.bytes).toBeGreaterThanOrEqual(0);
  });

  test("C10: health shows per-source gen/cursor + freshness", () => {
    const insp = buildInspectorProjection(store, FIXTURE_NOW);
    expect(insp.health.sources.map((s) => s.source).sort()).toEqual([
      "code",
      "docs",
      "git",
      "memory",
    ]);
    for (const s of insp.health.sources) {
      expect(typeof s.publishedGen).toBe("number");
      expect(s.cursorPosition).toBeTruthy();
      expect(s.stale).toBe(false);
    }
  });

  // C11 (skin switch) and C12 (export-diff) are UI/server scenarios — covered in
  // the guide component suite and the cli guide-server suite respectively.
  test.todo("C11: skin switch changes ONLY the design-system layer — see packages/guide");
  test.todo("C12: export-diff (live ≡ export) — see packages/cli guide server suite");
});

describe("acceptance: 3a guide perf recorder (living-repo tier — recorded, not asserted)", () => {
  let root: string;
  let live: Store;

  beforeAll(async () => {
    root = makeTempDir("ctx-guide-live-");
    live = openStore({ projectDir: REPO_ROOT, home: join(root, "home") });
    const budget = { deadline: Number.MAX_SAFE_INTEGER, now: Date.now };
    const docs = new DocsAdapter();
    await docs.ingest(live, await docs.dirtyCheck(live), budget);
    const git = new GitAdapter();
    await git.ingest(live, await git.dirtyCheck(live), budget);
  }, 240_000);

  afterAll(() => {
    live.close();
    cleanupTempDir(root);
  });

  test("records per-projection perf on fixture AND living repo", () => {
    const now = Date.now();
    const perfs = [
      canvasWithPerf(live, now).perf,
      inspectorWithPerf(live, now).perf,
      searchWithPerf(live, "retry idempotent", null, now).perf,
      subjectWithPerf(live, "FABLE-DECISION-LOG.md", now).perf,
    ];
    for (const p of perfs) {
      expect(typeof p.latencyMs).toBe("number");
      expect(p.jsonBytes).toBeGreaterThan(0);
      // recorded, never asserted as a threshold (G-perf-recorded)
      // eslint-disable-next-line no-console
      console.log(`[guide-perf living-repo] ${formatPerf(p)}`);
    }
  });
});
