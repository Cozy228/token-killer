# Workstream E — Memory Quality Evaluation (deterministic benchmark spec)

> **Role.** Decision-anchored memory research for `ctx`, Decision 10 (Evaluation). This file is the
> implementable spec for a **minimal, deterministic, local** memory-quality benchmark — the eval
> doubles as the written contract for the not-yet-built mechanisms it exercises.
>
> **Invariants respected (from-doc, `MEMORY-RESEARCH-GOAL-PROMPT.md:40-41`, `CTX-DESIGN.md`):**
> no LLM / no embeddings / no network at write, serve, **or eval** time; one local SQLite+FTS5
> store per project; index-not-copy except memory/concepts; provenance per fact; conflicts
> surfaced not averaged. Every assertion below is a fixed input → exact expected value on a real
> `ctx` API — **no model-graded scoring anywhere**.
>
> **Determinism contract (matches the M1/M2 harness):** temp `CTX_HOME` sandbox (G-7), injected
> clock `now: () => number` (never `Date.now`), script-generated git + host-memory fixtures,
> `assertNoEgress` active (G-6). Every test carries a **failure label** from the fixed vocabulary:
> `false · stale · missing · duplicate · irrelevant-push · unanchored · unreviewed-import ·
> host-echo-loop · privacy-egress · unbounded-growth`.

Claims are tagged `from-code` (verified in a source file this session), `from-doc` (CTX design/impl
or acceptance docs), or `inferred` (design intent this spec encodes as a pending contract).

---

## 0. Where this plugs into the existing harness (reuse, don't reinvent)

`from-code` — verified against `packages/core/tests/**`:

| Machinery | Source | Reuse |
|---|---|---|
| sandbox / temp dirs | `tests/helpers/sandbox.ts` → `makeTempDir`, `cleanupTempDir`, `git`, `makeGitFixture` | build the fixture repo + isolated gitconfig |
| store open (G-7) | `openStore({ projectDir, home, now })` (`src/store/store.ts:664`) | `home` = temp sandbox; `now` = fixed clock |
| synthetic host memory | `seedClaudeMemory(claudeHome, projectRoot, files)` (`tests/unit/memory.test.ts:19-28`) | plant Claude Code memory dir under a fake `claudeHome` |
| memory write / read | `remember`, `recall`, `listMemories`, `setMemoryLifecycle`, `LIFECYCLE_STATUS` (`src/memory/remember.ts`) | E1/E3/E7 |
| host import | `importClaudeCodeMemory` (`src/memory/claudeImporter.ts:152`) | E4/E6 |
| dedup primitive | `fuzzyDuplicate` (`src/memory/dedup.ts:81`) | E4 |
| echo strip | `stripSentinelBlocks`, `hasSentinel` (`src/memory/sentinel.ts`) | E6 |
| push | `buildPushBlock`, `renderPushBlock`, `PUSH_MAX_BYTES`, `rankGotchas` (`src/push/block.ts`, `rank.ts`) | E5 |
| push placement | `placePushBlock(repo, text, { targets })` (`src/push/hosts.ts:115`) | E5 idempotency variant |
| serve | `serveContext`, `serveSearch`, `serveRemember` (`src/serve/serve.ts`) | E1/E7 (agent-facing path) |
| source ingest | `createGitAdapter()`, `new DocsAdapter()`, `createCodeAdapter()` + `adapter.dirtyCheck/ingest` or `RefreshEngine` (`tests/acceptance/1d-git.test.ts:65-70`, `1e-docs.test.ts:34-42`) | E2 target-change re-ingest |
| conflicts / provenance | `store.conflicts(status)`, `store.getClaim`, `store.claimsFor`, `store.linksFrom`, `store.anchorsOf` (`src/store/store.ts`) | E2/E7/EG |

**Scenario id namespace.** M1 uses `A*/G*`, M2 uses `B*/G8-9`. This benchmark is the **E-series**
(`E1..E7` = the seven Decision-10 tasks; `EG-*` = human-guide scenarios), owned by this file, wired
under `packages/core/tests/acceptance/e-memory-quality.test.ts` with the fixture builder in
`packages/core/tests/helpers/memoryFixture.ts`. Pending tests start as `test.todo` (M1/M2 pattern,
`M1-ACCEPTANCE.md:14`) and flip green when the mechanism they encode is built.

---

## 1. Fixture repo layout

A tiny synthetic service (~9 files) — deliberately covers **code + docs + decisions + git history +
seeded memory + host memory**. Built in a temp dir by `seedMemoryEvalFixture(root)` (below); shown
here as the on-disk tree it writes. Theme reuses the repo's existing test vocabulary (retry
idempotency / config validation, cf. `global-invariants.test.ts:39-48`) so seeds read naturally.

```
<tmp>/repo/                              # git repo, main branch, isolated gitconfig
├── README.md
├── src/
│   ├── auth.ts            # export function refreshToken() ; export function verify()      ← DELETED in commit C2 (E2 target-removed)
│   ├── retry.ts           # export class RetryQueue { enqueue(); redeliver() }             ← redeliver() signature CHANGED in C3 (E2 signature-changed)
│   └── config.ts          # export function loadConfig() ; export function validateConfig()
├── docs/
│   └── architecture.md    # backticked mentions of `src/retry.ts`, `src/auth.ts`
├── decisions/
│   ├── 0001-idempotent-retry.md   # ADR-style, status: accepted
│   └── 0002-strict-config.md      # ADR-style, status: accepted
└── .ctx/
    └── push.jsonc         # { "pin": [...], "veto": [...] }  (E5 pin/veto variant)

<tmp>/claude-home/.claude/projects/<slug>/memory/     # fake claudeHome (G-7), slug = claudeProjectSlug(repo)
├── MEMORY.md              # curated index → one gist per topic file
├── retry-dup-a.md         # near-dup gist  ┐ E4 (sameAsCandidate, never merged)
├── retry-dup-b.md         # near-dup gist  ┘
├── adr-11.md              # "...ADR 0011..."  ┐ E4 negative — differing-numbers veto
├── adr-13.md              # "...ADR 0013..."  ┘
├── pushed-digest.md       # contains a <!-- ctx:managed:begin -->…end block   E6 sentinel echo
├── pure-echo.md           # ONLY a managed block (skipped on import)          E6 sentinel echo
└── paraphrase.md          # restates a pushed gist, NO sentinel               E6 paraphrase echo (pending)
```

### 1.1 Representative seed contents (`from-doc`/`inferred` — exact strings the builder writes)

`src/retry.ts`
```ts
/** Redelivery queue. */
export class RetryQueue {
  enqueue(id: string): void { /* ... */ }
  redeliver(id: string): void { /* ... */ }         // C3 changes this to redeliver(id: string, attempt: number)
}
```

`src/auth.ts` (deleted by commit C2)
```ts
export function refreshToken(): string { return "tok"; }
export function verify(tok: string): boolean { return tok.length > 0; }
```

`docs/architecture.md`
```md
# Architecture
The `src/retry.ts` queue redelivers on failure. Auth lives in `src/auth.ts`.
```

`decisions/0001-idempotent-retry.md`
```md
---
status: accepted
---
# Retry must be idempotent
Double-charge on redelivery is the failure we avoid; dedup on a stable request id.
```

Host memory `MEMORY.md` (curated index → gists)
```md
# Index
- [Retry dup A](retry-dup-a.md) — the retry queue drops request metadata on redelivery under load
- [Retry dup B](retry-dup-b.md) — the retry queue drops request metadata on redelivery when overloaded
- [ADR 11](adr-11.md) — ADR 0011 records the evidence-ladder decision for the store
- [ADR 13](adr-13.md) — ADR 0013 records the evidence-ladder decision for the store
```

Host memory `pushed-digest.md` (sentinel echo — the digest ctx itself pushed, `from-code`
`sentinel.ts:15`)
```md
Field note before the block.
<!-- ctx:managed:begin -->
This project has a ctx context base (code, decisions, history, memory — with provenance).
⚠ retry queue drops metadata on redelivery — persist the idempotency key [ab12c]
<!-- ctx:managed:end -->
Field note after the block.
```

Host memory `paraphrase.md` (paraphrase echo — restates a **pushed** gist, no sentinel, `inferred`)
```md
Reminder: the retry queue loses metadata on redelivery, so always persist idempotency keys.
```

### 1.2 `remember()`-seeded memory (planted by the builder, fixed clock `t0 < t1 < t2 …`)

| key | note (gist) | anchors | lifecycle | serves task |
|---|---|---|---|---|
| `G_active1` | `retry queue drops metadata on redelivery — persist the idempotency key` | `sym:src/retry.ts#RetryQueue.redeliver` † | active, confirmed | E1 target, E5 include, E6 paraphrase source |
| `G_active2` | `config validation is strict; unknown keys are rejected with guidance` | `file:src/config.ts` | active, confirmed | E5 include, E7 |
| `G_stale`   | `auth token refresh must precede the 401 retry path` | `file:src/auth.ts` (deleted C2) | active → **needs-review** (E2) | E2, E5 exclude |
| `G_v1`      | `config validation is best-effort; unknown keys only warn` | — | → **superseded** by `G_v2` | E3, E5 exclude |
| `G_v2`      | `config validation is strict; unknown keys are hard-rejected` | — | active | E3 |
| `G_retired` | `legacy DEBUG=1 env toggles verbose retry logs` | — | **retired** via `setMemoryLifecycle` | E5 exclude |
| `N_1..N_6`  | 6 unrelated notes (windows startup, shard hashing, GBK box…) reusing `memory.test.ts:89` noise | — | active | E1 noise |

† `sym:` anchor requires M2 code ingest to resolve. Until then the builder anchors `G_stale`/
`G_active1` to `file:` targets (resolves today, `remember.ts:119-127`) and the `sym:` form is the
**E2 pending** variant. Both anchor forms are planted; the file-target variant runs today, the
symbol-target variant is `test.todo`.

---

## 2. Seeded conditions (what the benchmark deliberately plants, and why)

| Condition | How planted | Exercises | Failure label if mishandled |
|---|---|---|---|
| **Stale anchor — target removed** | `G_stale` anchored to `file:src/auth.ts`; commit C2 `git rm src/auth.ts`; re-ingest git+code | E2 | `stale` |
| **Stale anchor — symbol drift** | `G_active1` anchored to `sym:…redeliver`; commit C3 changes its signature | E2 (pending) | `stale` |
| **Superseded note** | `remember(supersedes: G_v1)` | E3 | `stale` |
| **Retired note** | `setMemoryLifecycle(G_retired, "retired")` | E5 | `irrelevant-push` |
| **Duplicate host memories** | `retry-dup-a.md` ≈ `retry-dup-b.md` (Jaccard ≥ 0.6, same numbers) | E4 | `duplicate` |
| **Duplicate negative (numbers)** | `adr-11.md` vs `adr-13.md` (differing embedded numbers) | E4 | `false` (spurious merge) |
| **Managed-sentinel echo** | `pushed-digest.md` + `pure-echo.md` carry `ctx:managed` blocks | E6 | `host-echo-loop` |
| **Paraphrased echo** | `paraphrase.md` restates the pushed `G_active1` gist, no sentinel | E6 (pending) | `host-echo-loop` |
| **Unreviewed import** | all host imports land `authority=inferred` (`claudeImporter.ts:224`); Decision-8 intended default `needs-review` | EG-review | `unreviewed-import` |
| **Provenance completeness** | every seed carries origin/authority/status/anchors/claims | E7 | `unanchored` |
| **Egress** | `assertNoEgress` armed across every test; no adapter opens a socket | E0 (global) | `privacy-egress` |
| **Growth bound** | superseded/retired retained not deleted; push ≤1KB | E3/E5 | `unbounded-growth` |

---

## 3. Task suite — E1..E7

Each task: **input → expected → failure-label → pass/fail (real-API assertion) → runnable today?**
Assertion sketches use the verified imports (`@ctx/core` / `../../src/...`), `must()` unwrap helper
(`1h-push.test.ts:217`), fixed clock, sandbox store.

### E1 — recall precision  ·  label: `missing`  ·  **runnable today** (`from-code`)

- **Input.** Seed `G_active1` + `N_1..N_6` (all active). Query the agent path two ways:
  `serveSearch({ store, now }, { query: "retry idempotency metadata" })` and
  `serveContext({ store, now }, { task: "how does the retry queue handle redelivery" })`.
- **Expected.** `G_active1` ranks in the **top-3** of `search().items`; the unrelated `N_*` notes
  (e.g. "windows startup perf") do **not** appear above it. In the `context()` task response the
  `memory` section's first item is `G_active1` and every rendered item carries a resolvable handle
  (G-5).
- **Pass/fail assertion.**
  ```ts
  const r = await serveSearch({ store, now }, { query: "retry idempotency metadata" });
  const idx = r.diag.search!.items.findIndex((i) => i.handle === G_active1.handle);
  expect(idx).toBeGreaterThanOrEqual(0);
  expect(idx).toBeLessThan(3);                                   // relevant memory in top-3
  const noiseIdx = r.diag.search!.items.findIndex((i) => i.handle === N_winperf.handle);
  expect(noiseIdx === -1 || noiseIdx > idx).toBe(true);         // noise never outranks target
  // G-5: the winning handle round-trips through recall
  expect(recall(store, G_active1.handle).ok).toBe(true);
  ```
- **FAIL ⇒** label `missing` (relevant memory absent/below noise). A wrong note ranked #1 = `false`.

### E2 — stale-anchor detection  ·  label: `stale`  ·  **PENDING IMPL** (seed+write run today)

- **Input.** `G_stale` anchored to `file:src/auth.ts` (resolves today, `remember.ts:123`). Then
  commit C2 deletes `src/auth.ts`; re-run git + code ingest (`createGitAdapter`, `createCodeAdapter`)
  and the memory anchor-freshness pass.
- **Expected (intended contract, `from-doc` `CTX-IMPL.md:284-286`, `M2-ACCEPTANCE.md:72-75`):** when
  an anchor **target is removed / renamed / structurally changed**, ctx (a) transitions the anchored
  memory to `needs-review`, (b) records a `stale-suspect` **conflict** whose reason claim's `object`
  is one of `{ target-removed, signature-changed, body-changed, referencer-changed }` (never
  boolean), (c) down-ranks it out of push. The old memory is **kept** (no destructive loss).
- **Pass/fail assertion.**
  ```ts
  // (write path — runs today)
  expect(store.anchorsOf(G_stale.entityId)).toEqual(["file:src/auth.ts"]);
  // …delete src/auth.ts + commit + re-ingest…
  // (detection — PENDING; encodes the contract)
  expect(store.getMemory(G_stale.entityId)?.status).toBe("needs-review");
  const stale = store.conflicts("open").filter((c) => c.kind === "stale-suspect");
  const hit = stale.find((c) => store.getClaim(c.a)?.subject === G_stale.entityId);
  expect(hit, "anchor-drift stale-suspect").toBeDefined();
  expect(store.getClaim(hit!.b)?.object).toBe("target-removed");
  expect(recall(store, G_stale.handle).ok).toBe(true);           // kept + retrievable (not deleted)
  expect(buildPushBlock(store, { now }).handles).not.toContain(G_stale.handle);
  ```
- **FAIL ⇒** label `stale` (anchor points at deleted code but memory still active/pushed). Deleting
  the memory instead of flagging it = `unbounded-growth`-inverse (provenance loss) — also a fail.

### E3 — supersede behavior  ·  label: `stale`  ·  **runnable today** (`from-code` `remember.ts:235-253`)

- **Input.** `remember(G_v1, now:t0)`, then `remember(G_v2, supersedes: G_v1.handle, now:t1)`.
- **Expected.** `G_v1.status === "superseded"`, hidden from **active** listing and from push, but
  **retained** and retrievable; `G_v2` active; a `supersedes` link `G_v2 → G_v1` records provenance.
- **Pass/fail assertion.**
  ```ts
  expect(store.getMemory(G_v1.entityId)?.status).toBe("superseded");
  const active = listMemories(store, { status: "active" }).map((m) => m.entityId);
  expect(active).not.toContain(G_v1.entityId);
  expect(active).toContain(G_v2.entityId);
  expect(buildPushBlock(store, { now: t2 }).handles).not.toContain(G_v1.handle);   // rank.ts:76 active-only
  expect(recall(store, G_v1.handle).ok).toBe(true);                                // retained + retrievable
  expect(listMemories(store, { status: "superseded" }).map((m) => m.entityId)).toContain(G_v1.entityId);
  expect(store.linksFrom(G_v2.entityId, "supersedes").map((l) => l.dst)).toContain(G_v1.entityId);
  ```
- **FAIL ⇒** label `stale` (superseded note still active/served) or `unbounded-growth` (old note
  destroyed, provenance lost).

### E4 — duplicate-import detection  ·  label: `duplicate`  ·  **runnable today** (`from-code` `claudeImporter.ts:236-263`)

- **Input.** `importClaudeCodeMemory(store, { projectRoots:[repo], claudeHome })` over the fixture
  host memory (`retry-dup-a/b`, `adr-11/13`).
- **Expected.** Both near-dups are imported as **separate** entities (never merged, P21) with a
  `sameAsCandidate` link between them (`method: semantic-proposal`, `confidence: 0.5`). The
  differing-number pair (`adr-11`/`adr-13`) produces **no** candidate link.
- **Pass/fail assertion.**
  ```ts
  const r = importClaudeCodeMemory(store, { projectRoots: [repo], claudeHome });
  expect(r.entities).toBe(6);                                     // all kept — no destructive merge
  expect(r.candidates).toBeGreaterThanOrEqual(1);
  const link = store.linksFrom(dupA.id, "sameAsCandidate").find((l) => l.dst === dupB.id)
            ?? store.linksFrom(dupB.id, "sameAsCandidate").find((l) => l.dst === dupA.id);
  expect(link?.method).toBe("semantic-proposal");
  expect(link?.confidence).toBe(0.5);
  // negative: differing embedded numbers never candidate (dedup.ts:85)
  expect(fuzzyDuplicate(adr11Gist, adr13Gist).reason).toBe("differing-numbers");
  expect(store.linksFrom(adr11.id, "sameAsCandidate")).toHaveLength(0);
  ```
- **FAIL ⇒** label `duplicate` (near-dups silently coexist with no link) or `false` (a merge, or a
  spurious link across differing numbers).

### E5 — push-digest usefulness  ·  label: `irrelevant-push`  ·  **partly runnable** (active/retired/superseded today; stale+echo PENDING)

- **Input.** `buildPushBlock(store, { now, maxGotchas: 6 })` over the full seeded set (2 active
  gotchas, 1 superseded, 1 retired, 1 stale-anchored, 1 paraphrase-echo import).
- **Expected.** Block ≤ `PUSH_MAX_BYTES` incl. the 2-line fixed header (A9-budget, `block.ts:27`);
  contains the two **active confirmed** gotchas; **excludes** retired + superseded (today,
  `rank.ts:76`) and — per Decision 7 exclusion rules (`from-doc`
  `MEMORY-RESEARCH-GOAL-PROMPT.md:92`) — stale-anchored + echo-risk (**pending**). Pin/veto via
  `.ctx/push.jsonc` survives re-render (A9-pin-veto).
- **Pass/fail assertion.**
  ```ts
  const b = buildPushBlock(store, { now, maxGotchas: 6 });
  expect(b.bytes).toBeLessThanOrEqual(PUSH_MAX_BYTES);
  expect(Buffer.byteLength(b.text, "utf8")).toBe(b.bytes);
  expect(b.handles).toContain(G_active1.handle);
  expect(b.handles).toContain(G_active2.handle);
  expect(b.handles).not.toContain(G_retired.handle);              // today
  expect(b.handles).not.toContain(G_v1.handle);                   // today (superseded)
  expect(b.handles).not.toContain(G_stale.handle);                // PENDING (needs E2 status flip)
  expect(b.handles).not.toContain(echoParaphrase.handle);         // PENDING (needs E6 detection)
  ```
- **FAIL ⇒** label `irrelevant-push` (retired/superseded/stale/echo leaks into the ≤1KB digest, or
  the digest exceeds budget = `unbounded-growth`).

### E6 — echo prevention  ·  label: `host-echo-loop`  ·  **partly runnable** (sentinel today; paraphrase PENDING)

- **Input.** Import the fixture host memory containing `pushed-digest.md`, `pure-echo.md`
  (sentinel), and `paraphrase.md` (no sentinel). Precondition: `G_active1` was `remember()`-ed and
  its gist appears in the current pushed digest.
- **Expected — sentinel (today, `from-code` `claudeImporter.ts:185/202`, A1-echo).** No imported
  entity's gist/detail/name contains `ctx:managed`; the pure-sentinel file is skipped (`skipped ≥ 1`).
- **Expected — paraphrase (pending, `inferred`; `CTX-IMPL.md` M1 bar = exact match only,
  `sentinel.ts:9`).** `paraphrase.md` restates a **ctx-origin** gist without the sentinel; the
  intended contract is that it is recognized as an echo and is **not** admitted as an independent
  active memory — either skipped, or imported+`sameAsCandidate`-linked to `G_active1` and set
  `needs-review` (so it never re-enters push and inflates the loop).
- **Pass/fail assertion.**
  ```ts
  const r = importClaudeCodeMemory(store, { projectRoots: [repo], claudeHome });
  for (const id of r.written) {                                   // sentinel — runs today
    expect(store.getMemory(id)?.gist ?? "").not.toContain("ctx:managed");
    expect(store.getMemory(id)?.detail ?? "").not.toContain("ctx:managed");
  }
  expect(r.skipped).toBeGreaterThanOrEqual(1);                    // pure-echo file skipped
  // paraphrase — PENDING contract
  const para = r.written.map((id) => store.getMemory(id)).find((m) => m?.gist.includes("loses metadata"));
  const asActive = para && para.status === "active" &&
    store.linksTo(para.entityId, "sameAsCandidate").length === 0;
  expect(asActive, "paraphrase echo must not become an independent active memory").toBeFalsy();
  ```
- **FAIL ⇒** label `host-echo-loop` (a ctx-authored gist round-trips back in as a fresh independent
  memory via the host).

### E7 — provenance auditability  ·  label: `unanchored`  ·  **runnable today** (`from-code`; ergonomic drawer API pending)

- **Input.** For every served memory (a `remember()` note and a host-import note), read its
  provenance from store primitives.
- **Expected.** Each memory carries `origin` ∈ {`remember`, `host-import:claude-code`}, an
  `authority` (`confirmed` for `remember`, `inferred` for import — `remember.ts:207`,
  `claudeImporter.ts:224`), a `status`, its `anchors`, and — for each anchor — a backing **claim**
  disclosing `carrier / method / authority / at` (the evidence drawer, `from-doc`
  `CTX-IMPL.md:431`).
- **Pass/fail assertion.**
  ```ts
  const row = store.getMemory(G_active2.entityId);
  expect(row?.origin).toBe("remember");
  expect(row?.authority).toBe("confirmed");
  expect(row?.status).toBe("active");
  expect(store.anchorsOf(G_active2.entityId)).toEqual(["file:src/config.ts"]);
  const [c] = store.claimsFor(G_active2.entityId, "anchoredTo");
  expect(c?.carrier).toBe("remember");
  expect(c?.method).toBe("explicit-key");
  expect(c?.authority).toBe("confirmed");
  const imp = store.getMemory(importedId);
  expect(imp?.origin).toBe("host-import:claude-code");
  expect(imp?.authority).toBe("inferred");
  // (pending ergonomic API) memoryProvenance(store, id) → { origin, authority, status, anchors, claims }
  ```
- **FAIL ⇒** label `unanchored` (a memory is served with no resolvable origin/authority/anchor to
  audit — the user cannot trust-or-reject it).

### E0 — global egress + growth (cross-cutting, asserted in `beforeAll`/`afterEach`)

`from-code` — mirror `assertG6EgressActive` (`global-invariants.test.ts:172`) and G-7 sandbox check
on the eval store; assert total memory-entity count is **monotonic across supersede/retire** (rows
re-statused, never deleted → `unbounded-growth` guarded while provenance is preserved).

---

## 4. Human-guide review scenarios (Decision 9)

`ctx guide` is **strictly read-only** (FORK-1/P23, `from-doc` `CTX-DESIGN.md:240`,
`CTX-IMPL.md:431`). No guide code exists yet (`grep` for `guide/review queue/drawer` in
`packages/core/src` = 0 hits, `from-code`), so these scenarios assert on the **data layer that backs
the guide** today, and mark the loopback/HTML render `pending impl`. Each names exactly what a human
reviewer must see and how to assert it deterministically.

### EG-review — the review queue  ·  label: `unreviewed-import`
- **Sees.** Every `needs-review` memory (host-import-unconfirmed under Decision 8, + anchor-drifted
  from E2), each shown with its literal remediation command `ctx memory confirm <id>` /
  `ctx memory retire <id>` (`from-doc` `CTX-DESIGN.md:181`).
- **Assert (data layer, today).**
  ```ts
  const queue = listMemories(store, { status: "needs-review" });
  expect(queue.map((m) => m.entityId)).toEqual(expect.arrayContaining([G_stale.entityId]));
  // read-only invariant: querying the queue mutates nothing
  const before = listMemories(store).length;
  /* guideReviewQueue(store) */
  expect(listMemories(store).length).toBe(before);
  ```
- **Pending.** `guideReviewQueue(store)` returning `{ rows, commandFor(id) }`; the Hono loopback page.

### EG-drawer — the evidence drawer  ·  label: `unanchored`
- **Sees.** For any one served fact: `carrier · locus · method · authority · at` of each backing
  claim, plus anchors and lifecycle status (`from-doc` `CTX-IMPL.md:431`).
- **Assert (today).** assemble from `store.claimsFor(id)` + `store.getClaim` + `store.anchorsOf`
  (same primitives as E7); expect the assembled drawer to be non-empty for every rendered handle in
  an E1 `context()` response.
- **Pending.** a single `memoryProvenance(store, id)` assembler (the drawer's data contract).

### EG-stale-list — the stale-reference list  ·  label: `stale`
- **Sees.** All open `stale-suspect` conflicts, reason-classified (dead doc mentions **and**
  drifted memory anchors), the "free 鉴真 win" (`from-doc` `CTX-DESIGN.md:181`).
- **Assert (today for mentions, `from-code` `1e-docs.test.ts:111-135`; anchor rows pending E2).**
  ```ts
  const list = store.conflicts("open").filter((c) => c.kind === "stale-suspect");
  const reasons = new Set(list.map((c) => store.getClaim(c.b)?.object));
  for (const r of reasons)
    expect(["target-removed","signature-changed","body-changed","referencer-changed","never-resolved"])
      .toContain(r);
  ```

### EG-readonly — guide never writes  ·  label: (invariant guard)
- **Contract.** The guide surface **displays** lifecycle/pin-veto state and **surfaces commands**;
  mutation happens only through `setMemoryLifecycle` (library/CLI) and `.ctx/push.jsonc` edits
  (`from-doc` `CTX-DESIGN.md:240-241`). The eval encodes: every guide data function is pure-read;
  the only mutators in the memory surface are `remember`, `setMemoryLifecycle`, `writeMemory`,
  `setMemoryStatus`, importer, `placePushBlock` — none reachable from a guide request handler.
- **Assert (pending).** once `guide/` exists, a structural test that its request handlers import no
  store write method; today, a placeholder `test.todo("EG-readonly: guide handlers are write-free")`.

---

## 5. Pending-impl list — each test as the spec for a missing mechanism

The eval is written **contract-first**: the tests below are `test.todo` until the mechanism lands,
and their assertions ARE the acceptance bar for it.

| Pending test | Missing mechanism it forces | Owning milestone (from-doc) |
|---|---|---|
| **E2** stale-anchor (target-removed, signature/body-changed) | **Anchor-freshness pass**: on git/code re-ingest, join removed/renamed/structurally-changed anchor targets against `anchors`; flip anchored memory → `needs-review`; write reason-classed `stale-suspect` conflict; down-rank from push. Today only *doc mentions* get stale-suspect (`1e-docs`); memory anchors never invalidate. | M2 `B3-drift` (signature/body); target-removed = M2+ (`M2-ACCEPTANCE.md:72`, `1e-docs.test.ts:123`) |
| **E5** stale + echo exclusion from push | `rankGotchas` must also veto stale-anchored + echo-risk memories (today filters `status=active` only — `rank.ts:76`). Depends on E2 + E6. | Decision 7 (`MEMORY-RESEARCH-GOAL-PROMPT.md:92`) |
| **E6** paraphrase-echo prevention | **Cross-origin echo detection**: run `fuzzyDuplicate` (or a pushed-gist ledger match) between an incoming host gist and ctx-origin (`remember` + previously-pushed) gists; on match, do not admit an independent active memory (skip or `sameAsCandidate`+`needs-review`). Today dedup is *within-host only* (`claudeImporter.ts:238`); echo strip is *exact sentinel only* (`sentinel.ts:9`). | Decision 8 (`MEMORY-RESEARCH-GOAL-PROMPT.md:97`) |
| **E7** drawer API (ergonomic) | `memoryProvenance(store, id)` assembling `{origin, authority, status, anchors, claims[]}`. Data already present; helper missing (non-blocking — primitives assert today). | Decision 9 |
| **EG-review / EG-drawer / EG-stale-list / EG-readonly** | `ctx guide` loopback (Hono + bearer) with **read-only** data endpoints: review queue, evidence drawer, stale-reference list. No `guide/` code today. | M3 (`CTX-IMPL.md:546`) |
| **Decision 8 default** | host-import memory default `status: needs-review` instead of `active` (`claudeImporter.ts:224` writes `active`). Would populate EG-review and change E5 (imports not pushed until confirmed). | open decision |

**Runnable TODAY (no new mechanism):** E1, E3, E4, E7 (primitive level), E0; the sentinel half of
E6; the budget/active/retired/superseded half of E5; the mention half of EG-stale-list. These flip
green immediately and guard against regression while the pending mechanisms are built.

---

## 6. Determinism & anti-cheat notes

- **No model-graded scoring.** Every expectation is an exact value / set membership / rank index on
  a real API — never "an LLM judges relevance". Ranking tests assert *position* (`findIndex < 3`)
  against a fixed FTS+select engine with an injected clock, so results are byte-stable
  (cf. `1h-push.test.ts` byte-identical re-render).
- **No network.** `assertNoEgress` armed in `beforeAll`; scrub `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`
  (`global-invariants.test.ts:29`). The importer reads a **fake** `claudeHome`, never real
  `~/.claude` (G-7).
- **Fixed clock.** All `remember`/ingest calls pass `now: () => <fixed ms>` with `t0<t1<t2…` so
  recency-decay ranking (`rank.ts:40`) is deterministic; supersede/stale ordering is explicit.
- **Fixture is script-generated** in a temp dir and torn down (`cleanupTempDir`, Windows-EBUSY-hard),
  so the suite is machine-independent and needs no env-gate (unlike the living-repo A1 tier).
```
