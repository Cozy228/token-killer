/**
 * Global invariants (M1-ACCEPTANCE §"Global invariants" G-1..G-7) — asserted on
 * EVERY serve response, across every scenario. Slice 1g turns them into the
 * shared helpers in `tests/helpers/serveInvariants.ts`; here each G-todo is
 * flipped green against a fast, deterministic fixture store (fixed clock, temp
 * CONTEXA_HOME sandbox), and the scenario tests (1g-serve.test) apply the same
 * helpers on the living repo.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { DocsAdapter } from "../../src/ingest/docs.ts";
import { CodeParserCore } from "../../src/extract/code/runtime.ts";
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

// Scrub any runner model key so the scenario serve calls run (the guard stays
// active; the dedicated G-6 assertion proves refusal via an injected key).
delete process.env.ANTHROPIC_API_KEY;
delete process.env.OPENAI_API_KEY;

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
    // Non-trivial: 30 decision docs overflow the decisions section cap, so the
    // typed struct DID omit — reconciliation is exercised, not vacuous.
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

  test("G-7 tests never touch real ~/.claude/~/.copilot/host configs (temp CONTEXA_HOME/HOME only)", () => {
    assertG7Sandbox(store);
  });
});

/**
 * M2 global invariants (G-8 span integrity, G-9 identity stability), asserted
 * wherever symbols appear. Flipped green by slice 2a — the whole slice is built
 * on these two rules, so they are exercised directly on the extractor.
 */
describe("acceptance: M2 global invariants (G-8, G-9)", () => {
  let core: CodeParserCore;
  beforeAll(() => {
    core = new CodeParserCore();
  });
  afterAll(() => core.dispose());

  test("G-8 span integrity: source text is never byte-sliced (multibyte stays intact)", async () => {
    // A CJK+emoji comment BEFORE the definition pushes every UTF-8 byte offset
    // off the UTF-16 string index. A byte-slice would corrupt the identifier;
    // node.text keeps it verbatim, and the span points at the right line.
    const src = `// 你好世界🎉 comment\nexport function 问候(x: number): string {\n  return "日本語🍣" + x;\n}\n`;
    const res = await core.parse("g8.ts", src, "typescript");
    expect(res.hadError).toBe(false);
    const sym = res.symbols.find((s) => s.name === "问候");
    expect(sym, "multibyte identifier extracted via node.text").toBeDefined();
    expect(sym?.name).toBe("问候"); // byte-slice would mangle this
    expect(sym?.span[0]).toBe(2); // correct LINE despite the preceding multibyte
    // The hash is over node.text; determinism across re-parse (no offset drift).
    const again = await core.parse("g8.ts", src, "typescript");
    expect(again.symbols.find((s) => s.name === "问候")?.contentHash).toBe(sym?.contentHash);
  });

  test("G-9 identity stability: id survives whitespace/comment/line edits; only rename retires it", async () => {
    const v1 = `export function alpha(a: number) { return a; }\nexport function beta() { return 1; }\n`;
    // Same names + signatures; reformatted, comment added, lines shifted.
    const v2 = `// a fresh comment\n\nexport function alpha(a: number) {\n  return a;\n}\n\n\nexport function beta() {\n  return 1;\n}\n`;
    const r1 = await core.parse("g9.ts", v1, "typescript");
    const r2 = await core.parse("g9.ts", v2, "typescript");
    const ids1 = new Set(r1.symbols.map((s) => s.id));
    const ids2 = new Set(r2.symbols.map((s) => s.id));
    expect(ids2, "symbol ids survive whitespace/comment/line-shift edits").toEqual(ids1);

    const a1 = r1.symbols.find((s) => s.name === "alpha");
    const a2 = r2.symbols.find((s) => s.name === "alpha");
    expect(a2?.id).toBe(a1?.id); // id stable
    expect(a2?.span[0]).not.toBe(a1?.span[0]); // span MOVED → it is an attribute, not identity
    expect(a2?.contentHash).not.toBe(a1?.contentHash); // body reformatting changed the hash

    // A rename produces a NEW id (the only way an id is retired, §3/G-9).
    const v3 = v1.replace("alpha", "alphaRenamed");
    const r3 = await core.parse("g9.ts", v3, "typescript");
    expect(r3.symbols.map((s) => s.id)).not.toContain(a1?.id);
    expect(r3.symbols.some((s) => s.id === "sym:g9.ts#alphaRenamed")).toBe(true);
  });
});
