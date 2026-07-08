/**
 * Workstream-E — memory-quality benchmark (E0–E7 + EG). Decision-anchored,
 * deterministic, local: fixed inputs → exact expected values on the real ctx
 * API, no model-graded scoring, no network (assertNoEgress armed, G-6/G-7).
 *
 * Each test carries a failure label from the fixed vocabulary (comments below).
 * Pending mechanisms (E6 paraphrase/cross-origin echo, the M3 guide loopback)
 * stay `test.todo` with a one-line reason — the runnable set guards Phase-1.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { importClaudeCodeMemory } from "../../src/memory/claudeImporter.ts";
import { fuzzyDuplicate } from "../../src/memory/dedup.ts";
import { rebuildMemoryStatuses } from "../../src/memory/fold.ts";
import {
  listMemories,
  recall,
  remember,
  setMemoryLifecycle,
  type RememberResult,
} from "../../src/memory/remember.ts";
import { buildPushBlock, PUSH_MAX_BYTES } from "../../src/push/block.ts";
import { readPushConfig } from "../../src/push/push.ts";
import { memoryFreshnessPenalty } from "../../src/select/rank.ts";
import { STALE_MEMORY_PENALTY } from "../../src/select/constants.ts";
import { serveContext, serveSearch } from "../../src/serve/serve.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { assertG6EgressActive, assertG7Sandbox } from "../helpers/serveInvariants.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";
import {
  buildEvalRepo,
  changeRedeliverSignature,
  deleteAuth,
  GIST,
  ingestSources,
  redeliverSymbolId,
  reingestGitCode,
  seedHostMemory,
} from "../helpers/memoryFixture.ts";

// Egress guard armed for the whole suite (privacy-egress label).
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

const T0 = Date.UTC(2026, 6, 5, 12, 0, 0);

describe("acceptance: E memory-quality", () => {
  let root: string;
  let repo: string;
  let claudeHome: string;
  let store: Store;
  let clock: number;
  const now = (): number => clock;

  beforeEach(() => {
    root = makeTempDir("ctx-e-");
    repo = buildEvalRepo(root);
    claudeHome = join(root, "claude-home");
    clock = T0;
    store = openStore({ projectDir: repo, home: join(root, "contexa-home"), now });
  });
  afterEach(() => {
    store.close();
    cleanupTempDir(root);
  });

  /** remember() at the current clock, unwrapped (advances the clock by 1s). */
  function remb(
    note: string,
    opts: Partial<Parameters<typeof remember>[1]> = {},
  ): RememberResult & { ok: true } {
    clock += 1000;
    // Store-only quality fixtures assert the human-committed surface (slice 5).
    const r = remember(store, { surface: "cli", ...opts, note, now });
    if (!r.ok) throw new Error(`remember failed (${r.reason}): ${note}`);
    return r;
  }

  // ---- E0 — global egress + growth · label: privacy-egress / unbounded-growth ----
  test("E0: egress guard active, sandboxed store, entity count monotonic across lifecycle", async () => {
    assertG7Sandbox(store);
    await assertG6EgressActive(store);
    const a = remb(GIST.active1, { note: GIST.active1, anchors: ["file:src/retry.ts"] });
    const v1 = remb(GIST.v1, { note: GIST.v1 });
    const before = store.entityCount();
    // supersede + retire re-status rows, never delete them (growth is bounded,
    // provenance preserved).
    remb(GIST.v2, { note: GIST.v2, supersedes: v1.handle });
    setMemoryLifecycle(store, a.handle, "retired");
    expect(store.entityCount()).toBeGreaterThanOrEqual(before); // never shrinks
    expect(recall(store, v1.handle).ok).toBe(true); // superseded row retained
    expect(recall(store, a.handle).ok).toBe(true); // retired row retained
  });

  // ---- E1 — recall precision · label: missing ----
  test("E1: relevant memory ranks in the top-3; noise never outranks it", async () => {
    const active1 = remb(GIST.active1, { note: GIST.active1, anchors: ["file:src/retry.ts"] });
    const noise = GIST.noise.map((n) => remb(n, { note: n }));
    const winperf = noise[0]!; // "windows startup perf…"

    const r = await serveSearch({ store, now }, { query: "retry idempotency metadata" });
    const items = r.diag.search!.items;
    const idx = items.findIndex((i) => i.entityId === active1.entityId);
    expect(idx, "relevant memory present").toBeGreaterThanOrEqual(0);
    expect(idx, "relevant memory in the top-3").toBeLessThan(3);
    const noiseIdx = items.findIndex((i) => i.entityId === winperf.entityId);
    expect(noiseIdx === -1 || noiseIdx > idx, "noise never outranks the target").toBe(true);
    // G-5: the winning handle round-trips through recall.
    expect(recall(store, active1.handle).ok).toBe(true);

    // Task path: the memory surfaces with a resolvable handle in ONE call.
    const ctx = await serveContext(
      { store, now },
      { task: "how does the retry queue handle redelivery" },
    );
    expect(ctx.isError).toBe(false);
    expect(
      ctx.diag.renderedHandles.some((h) => store.resolveHandle(h)?.entityId === active1.entityId),
    ).toBe(true);
  });

  // ---- E2 — stale-anchor detection · label: stale ----
  test("E2 file-target-removed: deleting an anchored file flips the memory to needs-review + files a target-removed stale-suspect", async () => {
    const stale = remb(GIST.stale, { note: GIST.stale, anchors: ["file:src/auth.ts"] });
    expect(store.anchorsOf(stale.entityId)).toEqual(["file:src/auth.ts"]);
    await ingestSources(store); // auth.ts present → in the code source's prev set

    deleteAuth(repo);
    await reingestGitCode(store); // auth.ts now deleted → anchor target removed

    expect(store.getMemory(stale.entityId)?.status).toBe("needs-review");
    const suspects = store.conflicts("open").filter((c) => c.kind === "stale-suspect");
    const hit = suspects.find((c) => store.getClaim(c.a)?.subject === stale.entityId);
    expect(hit, "anchor-drift stale-suspect filed").toBeDefined();
    expect(store.getClaim(hit!.b)?.object).toBe("target-removed");
    expect(recall(store, stale.handle).ok).toBe(true); // kept, not deleted
    expect(buildPushBlock(store, { now: clock }).handles).not.toContain(stale.handle); // out of push
  });

  test("E2 sym-signature-changed: an arity change to an anchored symbol flips the memory + files signature-changed", async () => {
    await ingestSources(store);
    const symId = redeliverSymbolId(store);
    expect(symId, "redeliver symbol resolved by code ingest").toBeDefined();
    const mem = remb("RetryQueue.redeliver drops the attempt on the floor", {
      note: "RetryQueue.redeliver drops the attempt on the floor",
      anchors: [symId!],
    });

    changeRedeliverSignature(repo);
    await reingestGitCode(store);

    expect(store.getMemory(mem.entityId)?.status).toBe("needs-review");
    const suspects = store.conflicts("open").filter((c) => c.kind === "stale-suspect");
    const hit = suspects.find((c) => store.getClaim(c.a)?.subject === mem.entityId);
    expect(hit, "symbol-drift stale-suspect filed").toBeDefined();
    expect(store.getClaim(hit!.b)?.object).toBe("signature-changed");
    expect(recall(store, mem.handle).ok).toBe(true);
  });

  test("E2 body-changed asserts down-rank-only (A5): status stays active, conflict still filed", async () => {
    await ingestSources(store);
    const symId = redeliverSymbolId(store)!;
    const mem = remb("redeliver logs each attempt", {
      note: "redeliver logs each attempt",
      anchors: [symId],
    });
    // A body-only edit (same arity) → body-changed.
    writeFileSync(
      join(repo, "src", "retry.ts"),
      `/** Redelivery queue. */\nexport class RetryQueue {\n  enqueue(id: string): void { void id; }\n  redeliver(id: string): void { void id; /* changed body */ return; }\n}\n`,
      "utf8",
    );
    await reingestGitCode(store);

    expect(store.getMemory(mem.entityId)?.status).toBe("active"); // NOT flipped (A5)
    expect(store.claimsFor(mem.entityId, "stale-reason").map((c) => c.object)).toContain(
      "body-changed",
    );
    const hit = store
      .conflicts("open")
      .filter((c) => c.kind === "stale-suspect")
      .find((c) => store.getClaim(c.a)?.subject === mem.entityId);
    expect(hit, "body drift still visible as a conflict").toBeDefined();
  });

  // ---- E3 — supersede behavior · label: stale ----
  test("E3: supersede hides+retains the old note; new is active; provenance link recorded", () => {
    const v1 = remb(GIST.v1, { note: GIST.v1 });
    const v2 = remb(GIST.v2, { note: GIST.v2, supersedes: v1.handle });

    expect(store.getMemory(v1.entityId)?.status).toBe("superseded");
    const active = listMemories(store, { status: "active" }).map((m) => m.entityId);
    expect(active).not.toContain(v1.entityId);
    expect(active).toContain(v2.entityId);
    expect(buildPushBlock(store, { now: clock }).handles).not.toContain(v1.handle);
    expect(recall(store, v1.handle).ok).toBe(true); // retained + retrievable
    expect(listMemories(store, { status: "superseded" }).map((m) => m.entityId)).toContain(
      v1.entityId,
    );
    expect(store.linksFrom(v2.entityId, "supersedes").map((l) => l.dst)).toContain(v1.entityId);
  });

  // ---- E4 — duplicate-import detection · label: duplicate / false ----
  test("E4: near-dups import as separate entities + a sameAsCandidate link/conflict; differing numbers do NOT", () => {
    seedHostMemory(claudeHome, store.projectRoot);
    const r = importClaudeCodeMemory(store, { projectRoots: [store.projectRoot], claudeHome, now });
    expect(r.entities).toBe(6); // all kept — pure-echo skipped, no destructive merge
    expect(r.candidates).toBeGreaterThanOrEqual(1);

    const byGist = (needle: string): string | undefined =>
      r.written.find((id) => store.getMemory(id)?.gist.includes(needle));
    const dupA = byGist("under load");
    const dupB = byGist("when overloaded");
    expect(dupA && dupB).toBeTruthy();
    const link =
      store.linksFrom(dupA!, "sameAsCandidate").find((l) => l.dst === dupB) ??
      store.linksFrom(dupB!, "sameAsCandidate").find((l) => l.dst === dupA);
    expect(link?.method).toBe("semantic-proposal");
    expect(link?.confidence).toBe(0.5);
    expect(store.conflicts("open").some((c) => c.kind === "sameAsCandidate")).toBe(true);

    // Negative: differing embedded numbers never a candidate, no link.
    expect(
      fuzzyDuplicate(
        "ADR 0011 records the evidence-ladder decision for the store",
        "ADR 0013 records the evidence-ladder decision for the store",
      ).reason,
    ).toBe("differing-numbers");
    const adr11 = byGist("0011");
    expect(adr11).toBeTruthy();
    expect(store.linksFrom(adr11!, "sameAsCandidate")).toHaveLength(0);
  });

  // ---- E5 — push-digest usefulness · label: irrelevant-push ----
  test("E5: push carries active confirmed gotchas, ≤1KB, excludes retired/superseded/needs-review", () => {
    const a1 = remb(GIST.active1, { note: GIST.active1, anchors: ["file:src/retry.ts"] });
    const a2 = remb(GIST.active2, { note: GIST.active2, anchors: ["file:src/config.ts"] });
    const v1 = remb(GIST.v1, { note: GIST.v1 });
    remb(GIST.v2, { note: GIST.v2, supersedes: v1.handle }); // v1 → superseded
    const retired = remb(GIST.retired, { note: GIST.retired });
    setMemoryLifecycle(store, retired.handle, "retired");
    const stale = remb(GIST.stale, { note: GIST.stale, anchors: ["file:src/auth.ts"] });
    setMemoryLifecycle(store, stale.handle, "needs-review"); // needs-review (as drift/import would)

    const b = buildPushBlock(store, { now: clock, maxGotchas: 6 });
    expect(b.bytes).toBeLessThanOrEqual(PUSH_MAX_BYTES);
    expect(Buffer.byteLength(b.text, "utf8")).toBe(b.bytes);
    expect(b.handles).toContain(a1.handle);
    expect(b.handles).toContain(a2.handle);
    expect(b.handles).not.toContain(retired.handle);
    expect(b.handles).not.toContain(v1.handle);
    expect(b.handles).not.toContain(stale.handle); // needs-review excluded (E2 status)
  });

  test("E5 pin-gate (A2): a pin cannot force a needs-review memory into push", () => {
    const ok = remb(GIST.active1, { note: GIST.active1, anchors: ["file:src/retry.ts"] });
    const stale = remb(GIST.stale, { note: GIST.stale, anchors: ["file:src/auth.ts"] });
    setMemoryLifecycle(store, stale.handle, "needs-review");
    writeFileSync(
      join(repo, ".contexa", "push.jsonc"),
      `{ "pin": ["${stale.handle}"], "veto": [] }\n`,
      "utf8",
    );
    const cfg = readPushConfig(repo);
    const b = buildPushBlock(store, { config: cfg, now: clock });
    expect(b.handles).not.toContain(stale.handle); // eligibility vetoes the pin
    expect(b.handles).toContain(ok.handle);
  });

  // ---- E6 — echo prevention · label: host-echo-loop ----
  test("E6 sentinel: no imported entity carries the managed sentinel; the pure-echo file is skipped", () => {
    seedHostMemory(claudeHome, store.projectRoot);
    const r = importClaudeCodeMemory(store, { projectRoots: [store.projectRoot], claudeHome, now });
    for (const id of r.written) {
      expect(store.getMemory(id)?.gist ?? "").not.toContain("ctx:managed");
      expect(store.getMemory(id)?.detail ?? "").not.toContain("ctx:managed");
    }
    expect(r.skipped).toBeGreaterThanOrEqual(1); // pure-echo.md skipped
  });

  test.todo(
    "E6 paraphrase: a no-sentinel restatement of a ctx-origin gist is not admitted as an independent active memory (cross-origin echo detection — Phase-1 scope excludes it)",
  );

  // ---- E7 — provenance auditability · label: unanchored ----
  test("E7: every served memory carries origin/authority/status/anchors + a backing claim", () => {
    const a2 = remb(GIST.active2, { note: GIST.active2, anchors: ["file:src/config.ts"] });
    seedHostMemory(claudeHome, store.projectRoot);
    const imp = importClaudeCodeMemory(store, {
      projectRoots: [store.projectRoot],
      claudeHome,
      now,
    });

    const row = store.getMemory(a2.entityId);
    expect(row?.origin).toBe("remember");
    expect(row?.authority).toBe("confirmed");
    expect(row?.status).toBe("active");
    expect(store.anchorsOf(a2.entityId)).toEqual(["file:src/config.ts"]);
    const [claim] = store.claimsFor(a2.entityId, "anchoredTo");
    expect(claim?.carrier).toBe("remember");
    expect(claim?.method).toBe("explicit-key");
    expect(claim?.authority).toBe("confirmed");

    const importedRow = store.getMemory(imp.written[0]!);
    expect(importedRow?.origin).toBe("host-import:claude-code");
    expect(importedRow?.authority).toBe("inferred");
  });

  // ---- E7-recovery — confirm restores standing · label: stale ----
  test("E7-recovery body-changed: drift down-ranks + pin-ineligible; confirm lifts both (claim kept, conflict resolved); re-drift re-flags", async () => {
    await ingestSources(store);
    const symId = redeliverSymbolId(store)!;
    const note = "redeliver must persist the idempotency key before dispatch";
    const mem = remb(note, { note, anchors: [symId] });
    writeFileSync(
      join(repo, ".contexa", "push.jsonc"),
      `{ "pin": ["${mem.handle}"], "veto": [] }\n`,
      "utf8",
    );
    const cfg = (): ReturnType<typeof readPushConfig> => readPushConfig(repo);
    const pinnedFlag = (): boolean | undefined =>
      buildPushBlock(store, { config: cfg(), now: clock }).rendered.find(
        (g) => g.entityId === mem.entityId,
      )?.pinned;
    const entity = (): NonNullable<ReturnType<typeof store.getEntity>> =>
      store.getEntity(mem.entityId)!;

    // Baseline: clean → full standing, pin honored.
    expect(memoryFreshnessPenalty(store, entity())).toBe(1);
    expect(pinnedFlag()).toBe(true);

    // (a) body-only drift → status stays active (A5), but penalized + pin-refused.
    writeFileSync(
      join(repo, "src", "retry.ts"),
      `/** Redelivery queue. */\nexport class RetryQueue {\n  enqueue(id: string): void { void id; }\n  redeliver(id: string): void { void id; /* drift 1 */ return; }\n}\n`,
      "utf8",
    );
    await reingestGitCode(store);
    expect(store.getMemory(mem.entityId)?.status).toBe("active");
    expect(store.openStaleSuspects(mem.entityId).length).toBeGreaterThanOrEqual(1);
    expect(memoryFreshnessPenalty(store, entity())).toBe(STALE_MEMORY_PENALTY);
    expect(
      pinnedFlag(),
      "pin refused while drifted (auto listing may still carry it, down-ranked)",
    ).not.toBe(true);

    // (b) human confirm → conflict resolved, audit claim KEPT, standing restored.
    const confirm = setMemoryLifecycle(store, mem.handle, "active");
    expect(confirm.ok).toBe(true);
    expect(store.openStaleSuspects(mem.entityId)).toHaveLength(0);
    expect(store.claimsFor(mem.entityId, "stale-reason").length).toBeGreaterThanOrEqual(1); // audit trail intact
    expect(memoryFreshnessPenalty(store, entity())).toBe(1);
    expect(pinnedFlag()).toBe(true); // push-eligible again

    // (c) a SECOND drift after the confirm re-files a FRESH open conflict —
    // no one-shot immunity; new claims get new ids, so the (a,b) PK never collides.
    writeFileSync(
      join(repo, "src", "retry.ts"),
      `/** Redelivery queue. */\nexport class RetryQueue {\n  enqueue(id: string): void { void id; }\n  redeliver(id: string): void { void id; /* drift 2, different body */ }\n}\n`,
      "utf8",
    );
    await reingestGitCode(store);
    expect(store.openStaleSuspects(mem.entityId).length).toBeGreaterThanOrEqual(1); // fresh OPEN conflict
    expect(store.claimsFor(mem.entityId, "stale-reason").length).toBeGreaterThanOrEqual(2); // both audits kept
    expect(memoryFreshnessPenalty(store, entity())).toBe(STALE_MEMORY_PENALTY);
    expect(pinnedFlag()).not.toBe(true); // re-excluded from the pin path
  });

  test("E7-recovery signature-changed: needs-review + push-ineligible; confirm → active + eligible", async () => {
    await ingestSources(store);
    const symId = redeliverSymbolId(store)!;
    const note = "redeliver keeps its single-argument contract";
    const mem = remb(note, { note, anchors: [symId] });

    changeRedeliverSignature(repo);
    await reingestGitCode(store);
    expect(store.getMemory(mem.entityId)?.status).toBe("needs-review");
    expect(store.openStaleSuspects(mem.entityId).length).toBeGreaterThanOrEqual(1);
    expect(buildPushBlock(store, { now: clock }).handles).not.toContain(mem.handle); // out of push

    const confirm = setMemoryLifecycle(store, mem.handle, "active");
    expect(confirm.ok).toBe(true);
    expect(store.getMemory(mem.entityId)?.status).toBe("active");
    expect(store.openStaleSuspects(mem.entityId)).toHaveLength(0);
    expect(store.claimsFor(mem.entityId, "stale-reason").length).toBeGreaterThanOrEqual(1); // audit kept
    expect(buildPushBlock(store, { now: clock }).handles).toContain(mem.handle); // eligible again
  });

  // ---- EG-review — the review queue · label: unreviewed-import ----
  test("EG-review: host imports + drifted anchors populate the needs-review queue; querying it mutates nothing", () => {
    seedHostMemory(claudeHome, store.projectRoot);
    importClaudeCodeMemory(store, { projectRoots: [store.projectRoot], claudeHome, now });
    const drifted = remb(GIST.stale, { note: GIST.stale, anchors: ["file:src/auth.ts"] });
    setMemoryLifecycle(store, drifted.handle, "needs-review");

    const queue = listMemories(store, { status: "needs-review" });
    expect(queue.map((m) => m.entityId)).toContain(drifted.entityId);
    expect(queue.length).toBeGreaterThanOrEqual(2); // imports (needs-review) + drift
    // Read-only invariant: enumerating the queue mutates nothing.
    const before = listMemories(store).length;
    listMemories(store, { status: "needs-review" });
    expect(listMemories(store).length).toBe(before);
  });

  // ---- EG-stale-list — reason-classified stale conflicts · label: stale ----
  test("EG-stale-list: open stale-suspect conflicts are reason-classified in the allowed vocabulary", async () => {
    const stale = remb(GIST.stale, { note: GIST.stale, anchors: ["file:src/auth.ts"] });
    void stale;
    await ingestSources(store);
    deleteAuth(repo);
    await reingestGitCode(store);

    const list = store.conflicts("open").filter((c) => c.kind === "stale-suspect");
    expect(list.length).toBeGreaterThanOrEqual(1);
    const reasons = new Set(list.map((c) => store.getClaim(c.b)?.object));
    for (const r of reasons) {
      expect(
        [
          "target-removed",
          "signature-changed",
          "body-changed",
          "referencer-changed",
          "never-resolved",
        ],
        `unexpected stale reason class: ${r}`,
      ).toContain(r);
    }
  });

  test.todo(
    "EG-drawer/EG-readonly: the ctx guide loopback (Hono read-only endpoints, evidence drawer, write-free handlers) — lands with M3",
  );

  // ---- Slice 2 — event log + derived status fold ----

  // E5 collision · label: contradiction
  test("S2-E5: retire then supersede on one memory files a contradiction; later wins; both events kept", () => {
    const m = remb("collision candidate", { note: "collision candidate" });
    setMemoryLifecycle(store, m.handle, "retired"); // retire @ t1
    const v2 = remb("collision replacement", {
      note: "collision replacement",
      supersedes: m.handle,
    }); // supersede @ t2

    // later-by-total-order (supersede) wins the derived status.
    expect(store.getMemory(m.entityId)?.status).toBe("superseded");
    // a contradiction conflict is filed for human review (nothing auto-merged).
    const contradiction = store
      .conflicts("open")
      .filter((c) => c.kind === "contradiction")
      .find((c) => store.getClaim(c.a)?.subject === m.entityId);
    expect(contradiction, "contradiction conflict filed").toBeDefined();
    // BOTH colliding decisions are retained in the append-only log.
    const verbs = store.memoryEvents(m.entityId).map((e) => e.verb);
    expect(verbs).toContain("retire");
    expect(verbs).toContain("supersede");
    expect(recall(store, m.entityId).ok).toBe(true); // old memory kept
    void v2;
  });

  // Lifecycle verbs append provenance-carrying events; old rows kept.
  test("S2: lifecycle verbs append immutable, provenance-carrying events (create baseline + verb)", () => {
    const m = remb("lifecycle provenance", { note: "lifecycle provenance" });
    const created = store.memoryEvents(m.entityId);
    expect(created).toHaveLength(1);
    expect(created[0]?.verb).toBe("create");
    expect(created[0]?.refs.status).toBe("active"); // remember lands active (E3 overlay = slice 4)

    setMemoryLifecycle(store, m.handle, "retired");
    const after = store.memoryEvents(m.entityId);
    expect(after).toHaveLength(2);
    const retire = after[1]!;
    expect(retire.verb).toBe("retire");
    expect(retire.actor).toBe("cli"); // A4: lifecycle is a human/CLI decision
    expect(retire.carrier).toBe("cli");
    expect(retire.at).toBeGreaterThanOrEqual(created[0]!.at); // total-orders after create
  });

  // Confirm resolves the stale-suspect via an EVENT; drift appends NO events.
  test("S2: drift never appends events; confirm resolves the conflict via a resolve-conflict event", async () => {
    await ingestSources(store);
    const symId = redeliverSymbolId(store)!;
    const note = "redeliver holds the idempotency key";
    const mem = remb(note, { note, anchors: [symId] });
    expect(store.memoryEvents(mem.entityId)).toHaveLength(1); // just `create`

    // Anchor drift (signature change) — derived index state, NOT an event (S4).
    changeRedeliverSignature(repo);
    await reingestGitCode(store);
    expect(store.getMemory(mem.entityId)?.status).toBe("needs-review"); // composed (A5)
    expect(store.getMemory(mem.entityId)?.driftReason).toBe("signature-changed");
    expect(store.memoryEvents(mem.entityId), "drift added no events").toHaveLength(1);

    // Human confirm = a decision event; it clears drift + resolves the conflict
    // via an appended resolve-conflict event carrying the conflict reference.
    setMemoryLifecycle(store, mem.handle, "active");
    const verbs = store.memoryEvents(mem.entityId).map((e) => e.verb);
    expect(verbs).toContain("confirm");
    expect(verbs).toContain("resolve-conflict");
    expect(store.getMemory(mem.entityId)?.status).toBe("active");
    expect(store.getMemory(mem.entityId)?.driftReason).toBeUndefined(); // drift cleared
    expect(store.openStaleSuspects(mem.entityId)).toHaveLength(0);
  });

  // Rebuild preserves the drift annotation AND the fold (invariant b).
  test("S2: rebuild recomposes fold ∘ drift — drift annotation survives a status wipe", async () => {
    await ingestSources(store);
    const symId = redeliverSymbolId(store)!;
    const note = "redeliver never double-dispatches";
    const mem = remb(note, { note, anchors: [symId] });
    changeRedeliverSignature(repo);
    await reingestGitCode(store);
    expect(store.getMemory(mem.entityId)?.status).toBe("needs-review");

    // Corrupt the cached status, then rebuild purely from events + drift column.
    store.cacheMemoryStatus(mem.entityId, "active");
    rebuildMemoryStatuses(store, store.publishedGen("memory"));
    expect(store.getMemory(mem.entityId)?.status).toBe("needs-review"); // drift recomposed, not erased
    expect(store.getMemory(mem.entityId)?.driftReason).toBe("signature-changed");
  });

  // A1: retired (now event-derived) stays hard-excluded from selection.
  test("S2-A1: an event-derived retire hard-excludes the memory from selection; recall still works", async () => {
    const keep = remb(GIST.active1, { note: GIST.active1, anchors: ["file:src/retry.ts"] });
    const gone = remb("obsolete throwaway gotcha about retry", {
      note: "obsolete throwaway gotcha about retry",
      anchors: ["file:src/retry.ts"],
    });
    setMemoryLifecycle(store, gone.handle, "retired");

    const r = await serveSearch({ store, now }, { query: "retry idempotency metadata" });
    const ids = r.diag.search!.items.map((i) => i.entityId);
    expect(ids).not.toContain(gone.entityId); // retired excluded from pull
    expect(recall(store, gone.handle).ok).toBe(true); // but recoverable by handle
    void keep;
  });

  // F2: re-import must not clobber a human confirm (no duplicate create event).
  test("S2-F2: re-import of an unchanged file preserves a human confirm", () => {
    seedHostMemory(claudeHome, store.projectRoot);
    const r1 = importClaudeCodeMemory(store, {
      projectRoots: [store.projectRoot],
      claudeHome,
      now,
    });
    const id = r1.written[0]!;
    expect(store.getMemory(id)?.status).toBe("needs-review");

    // Human confirms the imported memory → active.
    setMemoryLifecycle(store, store.internHandle(id), "active");
    expect(store.getMemory(id)?.status).toBe("active");
    expect(store.memoryEvents(id).filter((e) => e.verb === "create")).toHaveLength(1);

    // Re-import the SAME files (same mtime → same id): must be inert on status.
    importClaudeCodeMemory(store, { projectRoots: [store.projectRoot], claudeHome, now });
    expect(store.getMemory(id)?.status, "confirm not clobbered").toBe("active");
    expect(
      store.memoryEvents(id).filter((e) => e.verb === "create"),
      "no duplicate create event",
    ).toHaveLength(1);
  });

  // A7: served_count is telemetry-only — untouched by lifecycle / fold / drift.
  test("S2-A7: served_count is untouched by remember / lifecycle / drift", async () => {
    await ingestSources(store);
    const symId = redeliverSymbolId(store)!;
    const mem = remb("redeliver keeps ordering", {
      note: "redeliver keeps ordering",
      anchors: [symId],
    });
    expect(store.getMemory(mem.entityId)?.servedCount).toBe(0);
    setMemoryLifecycle(store, mem.handle, "needs-review");
    changeRedeliverSignature(repo);
    await reingestGitCode(store);
    setMemoryLifecycle(store, mem.handle, "active");
    expect(store.getMemory(mem.entityId)?.servedCount).toBe(0); // never a ranking/lifecycle input
  });
});
