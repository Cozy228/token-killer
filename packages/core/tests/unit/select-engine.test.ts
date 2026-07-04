import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { select, search } from "../../src/select/engine.ts";
import { SECTION_ORDER } from "../../src/select/types.ts";
import { LEAN_TOTAL_TOKENS, WIDE_MULTIPLIER } from "../../src/select/constants.ts";
import { openStore, type Store } from "../../src/store/store.ts";
import { cleanupTempDir, makeTempDir } from "../helpers/sandbox.ts";

// Engine-level orchestration (§6 select()/search() library calls; G-3/G-4).

const NOW = Date.UTC(2026, 6, 4);

describe("select/engine", () => {
  let root: string;
  let store: Store;

  beforeAll(() => {
    root = makeTempDir("ctx-engine-");
    const project = join(root, "project");
    mkdirSync(project, { recursive: true });
    writeFileSync(
      join(project, "orders.md"),
      ["# Orders", "Order processing overview.", "", "Retries are idempotent by design."].join(
        "\n",
      ) + "\n",
    );
    store = openStore({ projectDir: project, home: join(root, "home"), now: () => NOW });

    const gen = store.beginGeneration("docs");
    store.upsertEntity({
      id: "file:orders.md",
      kind: "file",
      name: "orders.md",
      locator: { t: "file", path: "orders.md" },
      gen,
    });
    store.ftsIndex("file:orders.md", { name: "orders.md", text: "Orders", kind: "file" });
    store.upsertEntity({
      id: "doc:orders.md#orders",
      kind: "doc_section",
      name: "Orders",
      locator: { t: "file", path: "orders.md", span: [1, 4] },
      gen,
    });
    store.ftsIndex("doc:orders.md#orders", {
      name: "Orders",
      text: "Order processing overview. Retries are idempotent by design.",
      kind: "doc_section",
    });
    // graph edge: section referenced from the file (subgraph expansion path)
    store.setLink({
      src: "file:orders.md",
      dst: "doc:orders.md#orders",
      predicate: "references",
      method: "path-match",
      confidence: 1,
    });
    // an anchored memory (published under the MEMORY source's generation —
    // visibility is per-source, §2)
    const memGen = store.beginGeneration("memory");
    store.upsertEntity({
      id: "mem:orders-note",
      kind: "memory",
      name: "orders retry note",
      locator: { t: "store" },
      gen: memGen,
    });
    store.writeMemory({
      entityId: "mem:orders-note",
      gist: "retry path re-executes side effects",
      origin: "remember",
      authority: "confirmed",
    });
    store.ftsIndex("mem:orders-note", {
      name: "orders retry note",
      text: "retry path re-executes side effects",
      kind: "memory",
    });
    store.setLink({
      src: "mem:orders-note",
      dst: "file:orders.md",
      predicate: "anchoredTo",
      method: "explicit-key",
      confidence: 1,
    });
    // an answer-relevant open conflict between two claims on the section
    const a = store.addClaim({
      subject: "doc:orders.md#orders",
      predicate: "mentions",
      object: "gone.md",
      carrier: "files",
      method: "path-match",
      authority: "derived",
      gen,
    });
    const b = store.addClaim({
      subject: "doc:orders.md#orders",
      predicate: "stale-reason",
      object: "never-resolved",
      carrier: "files",
      method: "path-match",
      authority: "derived",
      gen,
    });
    store.addConflict(a, b, "stale-suspect");
    store.publishGeneration("docs");
    store.publishGeneration("memory");
  });

  afterAll(() => {
    store.close();
    cleanupTempDir(root);
  });

  test("ref mode: subject + expanded sections + answer-relevant conflicts, fixed order", () => {
    const r = select(store, { ref: "file:orders.md", now: () => NOW });
    if (!r.ok || r.mode === "facet") throw new Error("expected a composite SelectResult");
    expect(r.mode).toBe("ref");
    expect(r.subject?.entityId).toBe("file:orders.md");
    // fixed section order, call-over-call (G-4 at the struct level)
    expect(r.sections.map((s) => s.name)).toEqual([...SECTION_ORDER]);
    const memory = r.sections.find((s) => s.name === "memory")!;
    expect(memory.items.some((i) => i.entityId === "mem:orders-note")).toBe(true);
    const conflicts = r.sections.find((s) => s.name === "conflicts")!;
    expect(conflicts.items.length).toBe(1);
    expect(conflicts.items[0]!.text).toContain("stale-suspect");
    // envelope reconciles and discloses constants
    expect(r.envelope.totalBudgetTokens).toBe(LEAN_TOTAL_TOKENS);
    expect(r.envelope.constants["pprAlpha"]).toBe(0.25);
    // subject handle resolves back (G-5)
    expect(store.resolveHandle(r.subject!.handle)?.entityId).toBe("file:orders.md");
  });

  test("task mode: top-ranked hit becomes the subject; wide = 3x lean", () => {
    const r = select(store, {
      task: "how are order retries handled",
      budget: "wide",
      now: () => NOW,
    });
    if (!r.ok || r.mode === "facet") throw new Error("expected a composite SelectResult");
    expect(r.mode).toBe("task");
    expect(r.subject).toBeDefined();
    expect(r.envelope.budgetTier).toBe("wide");
    expect(r.envelope.totalBudgetTokens).toBe(LEAN_TOTAL_TOKENS * WIDE_MULTIPLIER);
  });

  test("handle mode with a facet: drill-down skips PPR and renders the facet", () => {
    const short = store.internHandle("doc:orders.md#orders", "text");
    const r = select(store, { handle: `[${short}]`, now: () => NOW });
    if (!r.ok || r.mode !== "facet") throw new Error("expected a FacetResult");
    expect(r.facet).toBe("text");
    expect(r.text).toContain("Retries are idempotent");
    expect(r.truncated).toBe(false);
    expect(r.tokens).toBeLessThanOrEqual(r.budgetTokens);
  });

  test("callers facet before M2: success-shaped note, never a throw (G-3)", () => {
    const r = select(store, { handle: "doc:orders.md#orders!callers", now: () => NOW });
    if (!r.ok || r.mode !== "facet") throw new Error("expected a FacetResult");
    expect(r.text).toBe("");
    expect(r.notes.join(" ")).toContain("M2");
  });

  test("unknown ref: SelectMiss with candidate guidance, not an exception", () => {
    const r = select(store, { ref: "sym:nope#missing", now: () => NOW });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toBe("unknown-ref");
    expect(r.guidance.length).toBeGreaterThan(0);
  });

  test("no input: SelectMiss(no-input)", () => {
    const r = select(store, { now: () => NOW });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toBe("no-input");
  });

  test("empty store: SelectMiss(empty-store) with sync guidance", () => {
    const emptyRoot = join(root, "empty-project");
    mkdirSync(emptyRoot, { recursive: true });
    const empty = openStore({ projectDir: emptyRoot, home: join(root, "empty-home") });
    const r = select(empty, { task: "anything" });
    expect(r.ok).toBe(false);
    if (r.ok) throw new Error("unreachable");
    expect(r.reason).toBe("empty-store");
    empty.close();
  });

  test("search: kinds filter narrows the flat list", () => {
    const all = search(store, { query: "retry orders", now: () => NOW });
    expect(all.items.length).toBeGreaterThan(1);
    const onlyMemory = search(store, { query: "retry orders", kinds: ["memory"], now: () => NOW });
    expect(onlyMemory.items.length).toBeGreaterThan(0);
    expect(onlyMemory.items.every((i) => i.kind === "memory")).toBe(true);
  });

  test("search: unpublished generations stay invisible (gen <= published_gen)", () => {
    const gen2 = store.beginGeneration("docs"); // never published
    store.upsertEntity({
      id: "doc:orders.md#draft",
      kind: "doc_section",
      name: "Draft",
      locator: { t: "file", path: "orders.md", span: [1, 1] },
      gen: gen2,
    });
    store.ftsIndex("doc:orders.md#draft", {
      name: "Draft",
      text: "retry orders draft section",
      kind: "doc_section",
    });
    const r = search(store, { query: "retry orders", now: () => NOW });
    expect(r.items.some((i) => i.entityId === "doc:orders.md#draft")).toBe(false);
  });
});
