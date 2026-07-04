/**
 * Global invariants (M1-ACCEPTANCE §"Global invariants" G-1..G-7) — asserted on
 * EVERY serve response, across every scenario. Slice 1g turns them into the
 * shared helpers in `tests/helpers/serveInvariants.ts`; here each G-todo is
 * flipped green against a fast, deterministic fixture store (fixed clock, temp
 * CTX_HOME sandbox), and the scenario tests (1g-serve.test) apply the same
 * helpers on the living repo.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DocsAdapter } from "../../src/ingest/docs.ts";
import { serveContext } from "../../src/serve/serve.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";
import {
  assertG1Budget,
  assertG2Reconcile,
  assertG3Recoverable,
  assertG4Order,
  assertG5Handles,
  assertG6EgressActive,
  assertG7Sandbox,
} from "../helpers/serveInvariants.ts";

const CLOCK = () => Date.UTC(2026, 6, 4);
const TASK = "why must retry be idempotent for config validation";

/** Decision seeds — one per file so each is its own seedable candidate (the
 *  seed engine caps matches per FILE, so many decisions in one file would not
 *  fan out; separate files make the decisions section genuinely overflow → G-2
 *  omission reconciliation becomes non-trivial). */
const DECISION_SEEDS = [
  "retry must be idempotent — double-charge on redelivery is the failure we avoid",
  "config validation runs at startup so a bad config fails fast, never mid-request",
  "retry queue must not drop metadata on redelivery; idempotency keys are persisted",
  "config schema is versioned; unknown keys are rejected with actionable guidance",
  "idempotent handlers dedup on a stable request id, never on wall-clock time",
  "retry backoff is capped; config sets the ceiling and the jitter window",
  "validation errors are structured, never prose, so callers can branch on them",
  "config reload is atomic; a partial retry reload never serves a torn config",
];

describe("acceptance: global invariants (G-1..G-7)", () => {
  let root: string;
  let store: Store;
  let resp: Awaited<ReturnType<typeof serveContext>>;

  beforeAll(async () => {
    root = makeTempDir("ctx-ginv-");
    const project = join(root, "proj");
    mkdirSync(join(project, "decisions"), { recursive: true });
    // 30 decision docs, one per file → the decisions section overflows its cap.
    for (let i = 1; i <= 30; i++) {
      const seed = DECISION_SEEDS[i % DECISION_SEEDS.length];
      writeFileSync(
        join(project, "decisions", `d${i}.md`),
        `# D${i} retry config idempotency\n\n${seed} (rationale ${i}).\n`,
      );
    }
    store = openStore({ projectDir: project, home: join(root, "home"), now: CLOCK });

    const docs = new DocsAdapter();
    await docs.ingest(store, await docs.dirtyCheck(store), {
      deadline: Number.MAX_SAFE_INTEGER,
      now: CLOCK,
    });

    // git history (commit → git source) so a history section renders.
    const g = store.beginGeneration("git");
    for (const [i, oid] of ["a1b2c3d4e5f6", "b2c3d4e5f6a1"].entries()) {
      const id = `commit:${oid}`;
      store.upsertEntity({
        id,
        kind: "commit",
        name: `fix retry idempotency ${i}`,
        locator: { t: "git", oid },
        attrs: { date: "2026-06-28", author: "wang" },
        gen: g,
      });
      store.ftsIndex(id, {
        name: `fix retry idempotency ${i}`,
        text: "retry idempotent config",
        kind: "commit",
      });
    }
    store.publishGeneration("git");

    // memory (memory source) so a memory section renders.
    const m = store.beginGeneration("memory");
    const memId = "mem:01JRETRYNOTE0000000000000";
    store.upsertEntity({
      id: memId,
      kind: "memory",
      name: "retry note",
      locator: { t: "store" },
      gen: m,
    });
    store.writeMemory({
      entityId: memId,
      gist: "retry queue drops metadata on redelivery — persist the idempotency key",
      origin: "remember",
      authority: "inferred",
    });
    store.ftsIndex(memId, {
      name: "retry note",
      text: "retry queue metadata idempotency config",
      kind: "memory",
    });
    store.publishGeneration("memory");

    resp = await serveContext({ store, now: CLOCK }, { task: TASK });
    expect(resp.isError).toBe(false);
  });

  afterAll(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("G-1 budget never exceeded; response <=24K chars", () => {
    assertG1Budget(resp);
    expect(resp.diag.envelope, "context response carries a selection envelope").toBeDefined();
  });

  test("G-2 envelope omission counts reconcile (typed struct level, per §9 addenda)", () => {
    assertG2Reconcile(resp);
    // Non-trivial: with 8 decisions in a 180-token section, the struct DID omit.
    expect(resp.diag.envelope!.omittedTotal, "fixture should exercise omissions").toBeGreaterThan(
      0,
    );
  });

  test("G-3 no isError for recoverable conditions; unknown ref -> success-shaped guidance", async () => {
    assertG3Recoverable(resp);
    const unknown = await serveContext({ store, now: CLOCK }, { ref: "sym:nope#missing" });
    assertG3Recoverable(unknown);
    expect(unknown.isError).toBe(false);
    expect(unknown.diag.recoverable).toBe(true);
    // Contrast: a MALFORMED argument IS the real isError case (§7 taxonomy).
    const bad = await serveContext({ store, now: CLOCK }, { budget: "huge" as never });
    expect(bad.isError).toBe(true);
  });

  test("G-4 section order stable call-over-call; empty sections omitted, never templated", async () => {
    assertG4Order(resp);
    const again = await serveContext({ store, now: CLOCK }, { task: TASK });
    expect(again.diag.sectionOrder, "section order stable call-over-call").toEqual(
      resp.diag.sectionOrder,
    );
    expect(again.text, "deterministic render call-over-call").toBe(resp.text);
    // This fixture has no open conflicts — the conflicts section is omitted
    // entirely (empty sections are never templated).
    expect(resp.diag.sectionOrder).not.toContain("conflicts");
  });

  test("G-5 every rendered item carries a resolvable handle (ctx recall <handle> round-trips)", () => {
    assertG5Handles(resp, store);
    expect(
      resp.diag.renderedHandles.length,
      "the response renders handles to check",
    ).toBeGreaterThan(0);
  });

  test("G-6 no egress: acceptance runs with network asserted unused (assertNoEgress active)", async () => {
    await assertG6EgressActive(store);
  });

  test("G-7 tests never touch real ~/.claude/~/.copilot/host configs (temp CTX_HOME/HOME only)", () => {
    assertG7Sandbox(store);
  });
});
