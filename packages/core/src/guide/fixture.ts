/**
 * M3 guide — deterministic fixture store (brief §7 "script-generated fixture
 * store"). Populates a store through the PUBLIC write API only, under a fixed
 * clock, so entity ids and content-derived handles are stable. Shared by the core
 * golden transcripts, the CLI server smoke, and the Playwright smoke so all three
 * deterministic tiers render the SAME data. It is a fixture builder, never a test
 * double: it exercises real store writes, then the guide reads it read-only.
 *
 * Covers every C1–C12 surface: sources+badges, a searchable doc/symbol/memory
 * note, a symbol with call edges, a memory note with a lifecycle chain, a
 * supersession chain (time lens), a co-change cluster (churn lens), a needs-review
 * queue, an open conflict, a push digest, and per-source gen/cursor health.
 */
import type { Store } from "../store/store.ts";

/** Fixed fixture clock — stable ids/handles/goldens (brief §7). */
export const FIXTURE_NOW = Date.UTC(2026, 6, 4);

/** Populate `store` with the deterministic guide fixture. Idempotent per store. */
export function buildFixtureStore(store: Store): void {
  seedCode(store);
  seedGit(store);
  seedDocs(store);
  seedMemory(store);
}

function seedCode(store: Store): void {
  const gen = store.beginGeneration("code");
  const files = [
    { id: "file:payments.ts", name: "payments.ts", path: "payments.ts" },
    { id: "file:orders.ts", name: "orders.ts", path: "orders.ts" },
  ];
  for (const f of files) {
    store.upsertEntity({
      id: f.id,
      kind: "file",
      name: f.name,
      locator: { t: "file", path: f.path },
      contentHash: `hash-${f.name}`,
      sourceRev: "rev-code-1",
      gen,
    });
    store.ftsIndex(f.id, { name: f.name, text: `${f.name} source file`, kind: "file" });
  }
  const symbols = [
    { id: "sym:charge", name: "charge", path: "payments.ts", span: [10, 40] as [number, number] },
    {
      id: "sym:validateCard",
      name: "validateCard",
      path: "payments.ts",
      span: [42, 60] as [number, number],
    },
    { id: "sym:retry", name: "retry", path: "orders.ts", span: [5, 30] as [number, number] },
  ];
  for (const s of symbols) {
    store.upsertEntity({
      id: s.id,
      kind: "symbol",
      name: s.name,
      locator: { t: "file", path: s.path, span: s.span },
      contentHash: `hash-${s.name}`,
      sourceRev: "rev-code-1",
      attrs: { language: "typescript" },
      gen,
    });
    store.ftsIndex(s.id, {
      name: s.name,
      text: `${s.name} function in ${s.path}`,
      kind: "symbol",
    });
    const claim = store.addClaim({
      subject: s.id,
      predicate: "defined-in",
      object: `file:${s.path}`,
      carrier: "tree-sitter",
      locus: `${s.path}#L${s.span[0]}`,
      method: "structural",
      authority: "observed",
      gen,
    });
    store.setLink({
      src: `file:${s.path}`,
      dst: s.id,
      predicate: "contains",
      method: "structural",
      confidence: 1,
      claimId: claim,
    });
  }
  // Call edges (2d biography): charge → validateCard, charge → retry.
  for (const [src, dst] of [
    ["sym:charge", "sym:validateCard"],
    ["sym:charge", "sym:retry"],
  ] as const) {
    store.setLink({ src, dst, predicate: "calls", method: "symbol-match", confidence: 1 });
    store.setLink({
      src: dst,
      dst: src,
      predicate: "called-by",
      method: "symbol-match",
      confidence: 1,
    });
  }
  store.publishGeneration("code");
  store.setCursor("code", "rev-code-1", FIXTURE_NOW, gen);
}

function seedGit(store: Store): void {
  const gen = store.beginGeneration("git");
  const commits = [
    { id: "commit:c1", name: "c1 add charge", oid: "c1aaaaaa" },
    { id: "commit:c2", name: "c2 idempotent retry", oid: "c2bbbbbb" },
  ];
  for (const c of commits) {
    store.upsertEntity({
      id: c.id,
      kind: "commit",
      name: c.name,
      locator: { t: "git", oid: c.oid },
      sourceRev: c.oid,
      gen,
    });
  }
  // touches: commits → files/symbols.
  store.setLink({
    src: "commit:c1",
    dst: "file:payments.ts",
    predicate: "touches",
    method: "explicit-key",
    confidence: 1,
  });
  store.setLink({
    src: "commit:c1",
    dst: "sym:charge",
    predicate: "touches",
    method: "explicit-key",
    confidence: 1,
  });
  store.setLink({
    src: "commit:c2",
    dst: "file:orders.ts",
    predicate: "touches",
    method: "explicit-key",
    confidence: 1,
  });
  store.setLink({
    src: "commit:c2",
    dst: "sym:retry",
    predicate: "touches",
    method: "explicit-key",
    confidence: 1,
  });
  // co-change cluster (churn lens): payments.ts ↔ orders.ts.
  store.setLink({
    src: "file:payments.ts",
    dst: "file:orders.ts",
    predicate: "co-changed",
    method: "structural",
    confidence: 0.8,
  });
  store.setLink({
    src: "file:orders.ts",
    dst: "file:payments.ts",
    predicate: "co-changed",
    method: "structural",
    confidence: 0.8,
  });
  store.publishGeneration("git");
  store.setCursor("git", "c2bbbbbb", FIXTURE_NOW, gen);
}

function seedDocs(store: Store): void {
  const gen = store.beginGeneration("docs");
  store.upsertEntity({
    id: "file:payments.md",
    kind: "file",
    name: "payments.md",
    locator: { t: "file", path: "payments.md" },
    gen,
  });
  store.upsertEntity({
    id: "doc:payments.md#retries",
    kind: "doc_section",
    name: "Retries are idempotent",
    locator: { t: "file", path: "payments.md", span: [12, 20] },
    contentHash: "hash-retries",
    sourceRev: "rev-docs-1",
    gen,
  });
  store.ftsIndex("doc:payments.md#retries", {
    name: "Retries are idempotent",
    text: "Retries must be idempotent to avoid a double charge on redelivery.",
    kind: "doc_section",
  });
  store.setLink({
    src: "file:payments.md",
    dst: "doc:payments.md#retries",
    predicate: "references",
    method: "path-match",
    confidence: 1,
  });
  // A decision entity + supersession chain target (time lens).
  store.upsertEntity({
    id: "decision:idempotent-retry",
    kind: "decision",
    name: "Adopt idempotent retry",
    locator: { t: "file", path: "payments.md", span: [12, 12] },
    sourceRev: "rev-docs-1",
    gen,
  });
  store.ftsIndex("decision:idempotent-retry", {
    name: "Adopt idempotent retry",
    text: "Decision: retry must be idempotent.",
    kind: "decision",
  });
  store.publishGeneration("docs");
  store.setCursor("docs", "rev-docs-1", FIXTURE_NOW, gen);
}

function seedMemory(store: Store): void {
  const gen = store.beginGeneration("memory");

  // Active mainline note (searchable, anchored, resolved).
  store.upsertEntity({
    id: "mem:retry-note",
    kind: "memory",
    name: "retry idempotency note",
    locator: { t: "store" },
    gen,
  });
  store.writeMemory({
    entityId: "mem:retry-note",
    gist: "Retry must be idempotent — a double-charge on redelivery is the failure we avoid.",
    origin: "human-note",
    authority: "confirmed",
    status: "active",
    disclosure: "shared",
  });
  store.ftsIndex("mem:retry-note", {
    name: "retry idempotency note",
    text: "Retry must be idempotent double charge redelivery",
    kind: "memory",
  });
  store.setMemoryOriginZone("mem:retry-note", "mainline");
  store.setAnchors("mem:retry-note", ["sym:retry", "doc:payments.md#retries"]);
  store.appendMemoryEvent({
    memoryId: "mem:retry-note",
    verb: "create",
    actor: "human",
    carrier: "remember",
    method: "explicit-key",
    authority: "confirmed",
    reason: "captured from payments review",
    at: FIXTURE_NOW - 3_000,
  });
  store.appendMemoryEvent({
    memoryId: "mem:retry-note",
    verb: "confirm",
    actor: "human",
    carrier: "remember",
    method: "explicit-key",
    authority: "confirmed",
    at: FIXTURE_NOW - 2_000,
  });

  // Needs-review overlay note (review queue, C7).
  store.upsertEntity({
    id: "mem:draft-note",
    kind: "memory",
    name: "draft cache note",
    locator: { t: "store" },
    gen,
  });
  store.writeMemory({
    entityId: "mem:draft-note",
    gist: "Cache invalidation on order update may be racy — needs a human to confirm.",
    origin: "remember",
    authority: "inferred",
    status: "needs-review",
    disclosure: "local",
  });
  store.setMemoryOriginZone("mem:draft-note", "overlay");
  store.appendMemoryEvent({
    memoryId: "mem:draft-note",
    verb: "create",
    actor: "agent",
    carrier: "remember",
    method: "semantic-proposal",
    authority: "inferred",
    at: FIXTURE_NOW - 1_000,
  });

  // Supersession chain (time lens, C5): old note superseded by new.
  store.upsertEntity({
    id: "mem:old-timeout",
    kind: "memory",
    name: "old timeout note",
    locator: { t: "store" },
    gen,
  });
  store.writeMemory({
    entityId: "mem:old-timeout",
    gist: "Timeout was 5s (superseded).",
    origin: "human-note",
    authority: "observed",
    status: "superseded",
  });
  store.setMemoryOriginZone("mem:old-timeout", "mainline");
  store.upsertEntity({
    id: "mem:new-timeout",
    kind: "memory",
    name: "new timeout note",
    locator: { t: "store" },
    gen,
  });
  store.writeMemory({
    entityId: "mem:new-timeout",
    gist: "Timeout is now 30s after the idempotency change.",
    origin: "human-note",
    authority: "confirmed",
    status: "active",
  });
  store.setMemoryOriginZone("mem:new-timeout", "mainline");
  store.setLink({
    src: "mem:new-timeout",
    dst: "mem:old-timeout",
    predicate: "supersedes",
    method: "explicit-key",
    confidence: 1,
  });
  store.appendMemoryEvent({
    memoryId: "mem:new-timeout",
    verb: "supersede",
    actor: "human",
    carrier: "remember",
    method: "explicit-key",
    reason: "raised timeout to 30s",
    authority: "confirmed",
    at: FIXTURE_NOW - 500,
  });

  store.publishGeneration("memory");
  store.setCursor("memory", "mem-cursor-1", FIXTURE_NOW, gen);

  // An open conflict (contradiction) between two memory-provenance claims (C8).
  const claimA = store.addClaim({
    subject: "mem:retry-note",
    predicate: "asserts",
    object: "timeout=30s",
    carrier: "remember",
    locus: "mem:retry-note",
    method: "explicit-key",
    authority: "confirmed",
    gen,
  });
  const claimB = store.addClaim({
    subject: "mem:old-timeout",
    predicate: "asserts",
    object: "timeout=5s",
    carrier: "remember",
    locus: "mem:old-timeout",
    method: "explicit-key",
    authority: "observed",
    gen,
  });
  store.addConflict(claimA, claimB, "contradiction");
}
