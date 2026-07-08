# Workstream A — Current ctx Memory Reality Map

> Scope: the actually-implemented memory behavior on `feat/1.0.0` (M1 built, M2 slice 2a merged),
> read directly from `packages/core/src/**` + `packages/cli/src/**`, cross-checked against the
> authority trio (`CONTEXA-DESIGN.md`, `CONTEXA-IMPL.md`, `FABLE-DECISION-LOG.md`), the acceptance bars
> (`docs/build/M1-ACCEPTANCE.md`, `M2-*`), and `docs/design/M1-REALITY-CHECK.md`.
>
> Every claim is labelled `[from-code]` (read in a source file), `[from-doc]` (design/spec text
> only), or `[inferred]` (my synthesis across both). Where design intent and code disagree the gap
> is called out explicitly. The current implementation is described **faithfully, not
> prescriptively** — other workstreams challenge it.

---

## 0. One-paragraph orientation

Memory in ctx is **not a subsystem** — it is one entity `kind` (`memory`) plus one lifecycle side
table (`memory`) inside the shared entity/claim/link/FTS graph, written by two thin authoring
layers (`remember()` for manual notes, `importClaudeCodeMemory()` for host import) and read back by
the same generic selection engine that ranks code/docs/history. `[from-code]` The store *is* the
source of truth for memory gist/detail (the sole index-not-copy exception), so memory rows carry
`locator:{t:'store'}` and are the only content that is copied-in rather than addressed by
locator. `[from-code CONTEXA-IMPL.md:135-136; store.ts:629-643]` Everything memory "does" beyond
storage is assembled from shared primitives — there is almost no memory-specific machinery.

---

## 1. What memory IS today (implemented behavior)

### 1.1 The data model `[from-code]`
- `memory` is an `EntityKind` (`store/types.ts:6-18`). A memory entity id is `mem:<ulid>`
  (`memory/ulid.ts:66-68`, id scheme `CONTEXA-IMPL.md:160`).
- The lifecycle side table (`store/migrations/001-init.sql:54-64`):
  `memory(entity_id PK→entities.id, gist, detail?, origin, session_ref?, authority, status
  DEFAULT 'active', served_count DEFAULT 0, last_served)`.
- `anchors(memory_id, entity_id)` (`001-init.sql:65-66`) is a plain edge table; anchors are ALSO
  materialized as claims+links (see §1.3).
- Gist is hard-capped at **240 chars** (`MEMORY_GIST_MAX_CHARS`, defined `claudeImporter.ts:30`
  and re-declared `store.ts:50`). The store throws `RangeError` on overflow as a backstop
  (`store.ts:337-343`).
- `authority` for a memory row is restricted to `"inferred" | "confirmed"` (`store/types.ts:134`),
  a narrowing of the 4-level claim ladder `observed|derived|inferred|confirmed`
  (`store/types.ts:21`).
- `MemoryStatus = active | needs-review | superseded | retired` (`store/types.ts:126`).
- `MemoryOrigin = host-import:<host> | remember | human-note` (`store/types.ts:125`).

### 1.2 `remember()` — the manual write path `[from-code memory/remember.ts:134-265]`
Behavior, step by exact step:
1. Trims the note; if `> 240` chars returns a **success-shaped** `{ok:false, reason:"gist-too-long",
   guidance}` — nothing written (`remember.ts:138-147`).
2. If `supersedes` is passed, resolves it to an existing memory entity; failure →
   `{ok:false, reason:"unresolved-supersedes", candidates}` (`remember.ts:150-163`).
3. Resolves anchors **all-or-nothing without writing** (`planAnchors`, `remember.ts:99-132`,
   `165-178`): an anchor resolves via `resolveHandle`, OR a `file:<rel>` anchor auto-plans a file
   entity **iff** the file exists under `projectRoot` and passes a path-traversal guard
   (`!isAbsolute && no ".." segment`, `remember.ts:119-128`). Any unresolved anchor → `{ok:false,
   reason:"unresolved-anchors", candidates}` with FTS-derived candidate suggestions
   (`candidatesFor`, `remember.ts:77-97`). So there are **exactly three** recoverable
   failure shapes.
4. Commit (only once everything resolves): opens ONE memory generation (`beginGeneration`),
   auto-creates any planned file entities, upserts the `mem:` entity with
   `locator:{t:'store'}, attrs:{origin:'remember'}`, writes the memory row with **`authority` =
   `input.authority ?? "confirmed"`** and **`status:"active"`** (`remember.ts:201-209`), sets
   anchors, and for each anchor adds an `anchoredTo` **claim** (`carrier:"remember",
   method:"explicit-key"`) + a **link** (`remember.ts:210-228`). FTS-indexes gist+detail
   (`remember.ts:229-233`). Publishes the generation (`remember.ts:255`).
5. Supersede: if resolved, `setMemoryStatus(old,"superseded")` — **old entry kept, only
   re-statused** — plus a `supersedes` claim+link new→old (`remember.ts:235-253`).

Net: manual notes default to **`confirmed` authority + `active` status**; the CLI never passes
`authority`, so every `ctx remember` / MCP `remember` is Confirmed (`cli.ts:133-139`,
`serve/serve.ts:321-326`). This is effectively the "human note = Confirmed" path from the design
(the `human-note` origin string itself is never emitted — see §2.6). `[inferred]`

### 1.3 Anchors are double-recorded `[from-code]`
An anchor becomes (a) an `anchors` table row (`store.setAnchors`, `store.ts:386-392`), AND (b) an
`anchoredTo` claim+link (`remember.ts:211-228`). The link is what selection traverses;
`anchoredTo` carries confidence `1.0` (default at `setLink`, `store.ts:285`) and a predicate
confidence floor of `1.0` (`select/constants.ts:68`). Empty anchors are legal (project-level
memory) — `planAnchors([])` returns empty, and the entity is written unanchored. `[from-code]`

### 1.4 `recall()` + lifecycle CLI `[from-code memory/remember.ts:267-393; cli.ts:151-193]`
- `recall(handle|id)` → for a memory, returns `gist + detail` from the row; for anything else,
  read-through via locator (`remember.ts:267-305`). Unknown handle → success-shaped guidance.
- `setMemoryLifecycle(store, id, status)` maps CLI verbs → status:
  `confirm→active`, `retire→retired`, `review→needs-review` (`cli.ts:112-116`; the library table
  `LIFECYCLE_STATUS` also has `active→active`, `remember.ts:320-325`). It just calls
  `setMemoryStatus` (`remember.ts:351`). No transition history is recorded.
- `listMemories(store, {status?})` enumerates memory rows, joined to entities, filtered by
  `gen<=published_gen`, ordered `last_verified DESC` (`remember.ts:360-393`).

### 1.5 Host import — `importClaudeCodeMemory()` `[from-code memory/claudeImporter.ts:152-267]`
- Source: `~/.claude/projects/<project-slug>/memory/` (`resolveClaudeMemoryDir`,
  `claudeImporter.ts:70-82`); slug = every non-alphanumeric → `-` (`claudeImporter.ts:65-67`);
  worktree-aware (tries `projectRoot` then `mainRoot`, `claudeImporter.ts:154`).
- Each topic `.md` → one `memory` entity with `locator:{t:'store'}`, **`authority:"inferred"`,
  `status:"active"`, `origin:"host-import:claude-code"`** (`claudeImporter.ts:205-225`). Gist
  preference: curated `MEMORY.md` index line → frontmatter `description` → first body line
  (`claudeImporter.ts:187-189`), capped at 240 on a word edge (`toGist`, `claudeImporter.ts:117-123`).
- Idempotent: id = `deterministicUlid(mtimeMs, "claude-code:<file>")` → re-import upserts in place
  (`claudeImporter.ts:198`, `ulid.ts:59-63`).
- Echo exclusion: `stripSentinelBlocks` on body/gist; a file empty after stripping is **skipped**
  (`claudeImporter.ts:185,192-195`); defensive re-strip before persist (`claudeImporter.ts:201-203`).
- Within-host near-dup detection: O(n²) `fuzzyDuplicate` over imported gists → emits a
  `sameAsCandidate` **claim+link (confidence 0.5, non-destructive)** only (`claudeImporter.ts:236-263`).

### 1.6 Dedup rules `[from-code memory/dedup.ts]`
`fuzzyDuplicate(a,b)`: both must clear an **entropy floor** (`≥24` chars AND Shannon entropy
`≥2.5` bits/char, `dedup.ts:19-20,66-68`); **differing embedded numbers veto** ("ADR 0011" ≠
"0013", `dedup.ts:43-45,85-87`); then **word-set Jaccard `≥0.6`** (`dedup.ts:21,88-91`). Returns a
verdict only — never merges (`dedup.ts:11-13`). The module is pure string→string; the
"memory/concept only" rule is enforced by *callers*, not here (`dedup.ts:5-8`).

### 1.7 Echo exclusion — `sentinel.ts` `[from-code]`
Strips exactly `<!-- ctx:managed:begin -->…<!-- ctx:managed:end -->` (`sentinel.ts:15,27-36`),
then defensively drops any residual line containing either marker. **Exact-block match only;
paraphrase echo is explicitly out of M1 scope** (`sentinel.ts:5-11`).

### 1.8 Push digest `[from-code push/*]`
- `renderPushBlock` (`push/block.ts:85-113`): `<!-- begin -->` + fixed 2-line header
  (`HEADER_LINES`, `block.ts:36-39`) + `Gotchas:` + `⚠ <gist> [handle]` lines + `<!-- end -->`.
  Greedy fill; a line that would push the block over **`PUSH_MAX_BYTES=1024`** stops the loop
  (`block.ts:94-102`) — so ≤1KB holds *by construction*. Readability cap `PUSH_MAX_GOTCHAS=6`
  (`block.ts:30`).
- `rankGotchas` (`push/rank.ts:53-112`): enumerates **`status:"active"` memories only**
  (`rank.ts:76`), scores each `authorityBoost(confirmed×1.3) × timeDecay(decayBasis)`
  (`rank.ts:39-46`), applies pin/veto with **veto winning** (`rank.ts:59-71`), pins render first.
  It reuses the *selection* primitives (`select/rank.ts`) — one scale for push and pull.
- `push/config.ts`: `.contexa/push.jsonc = {pin,veto}`; comments allowed; unknown keys / malformed →
  empty config + guidance, never throws (`config.ts:121-172`).
- `push/hosts.ts`: idempotent placement into the two-file floor `AGENTS.md` + `CLAUDE.md`
  (`hosts.ts:26`), byte-preserving around the managed block, refuses to write outside project root
  (`hosts.ts:69-74`).

### 1.9 How memory is served (pull) `[from-code]`
- MCP exposes **3 tools: `context`, `search`, `remember`** (`cli/src/mcp.ts:37-93`). `recall` and
  lifecycle are **CLI-only** — agents can write and read memory but cannot list/retire/review it
  over MCP (drill-down is `context(handle)` instead).
- In `select()`/`search()` (`select/engine.ts`) memory is a first-class citizen: FTS-seeded
  (`seeds.ts`), expanded along `anchoredTo`/`supersedes` links, PPR-ranked, post-multiplied
  (time-decay + authority boost, `select/rank.ts:76-93`), RRF-fused, and bucketed into the
  **`memory` section = 10% of the ~1200-token lean budget** (`select/constants.ts:90-98`,
  `sections.ts:54-55`).
- Facet `!detail` reads the memory row's gist+detail (`engine.ts:348-359`).

---

## 2. Design-intended but NOT implemented (doc-vs-code gaps)

### 2.1 Host import has NO invocation path — it is dead from any user action `[from-code, HIGH]`
The `MemorySourceAdapter.dirtyCheck` **always returns `dirty:false`** (`memory/adapter.ts:17-19`).
The `RefreshEngine` only ingests sources whose dirty check is true (`refresh.ts:123-124`
`.filter(c => c.report?.dirty === true)`). Therefore `importClaudeCodeMemory()` is reachable
**only** from `adapter.ingest` (never triggered) or directly from tests
(`grep`: 2 non-test call sites — `adapter.ts:23` + the `index.ts` re-export; 12 test references).
- CLI `ctx import` prints "Local host memory (Claude Code) is imported automatically on cold-path
  sync" (`cli.ts:242-245`) — **this claim is false as built**; `ctx sync`/`ctx install` never call
  memory ingest.
- `M1-REALITY-CHECK.md:16,73-77` corroborates: after `ctx sync` on this repo, `memory 1` (only the
  one manually-remembered note) and `memory: clean (behind 0, gen 0)`.
- Design intent: `CONTEXA-IMPL.md:199` "memory = always clean" + `adapter.ts:5-6,21` "cold-path host
  import" — the intent is that install/sync *do* import; no code wires that cold path.

### 2.2 Push ranking is missing two of four ratified factors `[from-code + from-doc, HIGH]`
P21 (`FABLE-DECISION-LOG.md:131-133`) and `CONTEXA-DESIGN.md:143-144` ratify push rank =
**authority × usage × recency × anchor-freshness**. Code (`push/rank.ts:39-46`) computes only
**authority × recency**. Missing:
- **usage** (`served_count`/`lastServedAt`): the columns exist (`001-init.sql:62-63`) and are read
  into `MemoryRow` (`store.ts:377-378`) but **nothing ever writes them** — no serve path increments
  `served_count` (grep confirms zero writers). P28④ deferred initial weights to `constants.ts`
  as "measurement-gated" (`FABLE-DECISION-LOG.md:251-252`), but no usage factor exists in
  `constants.ts` or `rank.ts`.
- **anchor-freshness**: see §2.3.

### 2.3 No anchor-freshness / anchor-invalidation anywhere (Decision-5 core) `[from-code + from-doc]`
- P21 (`FABLE-DECISION-LOG.md:126-127`): "anchored entries age via the code source's invalidation
  (anchor changed → **needs-review**, never auto-delete)."
- Code has **no** anchor-drift detection and **no** auto-transition to `needs-review`. `decayBasis`
  for memory (`select/rank.ts:43-52`) uses the newest `anchoredTo` claim's **write timestamp**
  (`c.at`), NOT whether the anchor target still resolves or changed. So "recency" = when the anchor
  was authored, never anchor liveness. `[from-code]`
- This is a **known-deferred M2 item**, not an oversight: `CONTEXA-IMPL.md:540-544` and
  `docs/build/M2-GOAL-PROMPT.md:57` (slice 2c) put "memory-anchor invalidation (anchor-drift →
  needs-review with signature/body-changed reason classes)" and the "anchor-drift test" in M2.
  Combined with §2.1, **memory receives no freshness treatment of any kind in M1**. `[inferred]`

### 2.4 `ctx guide` (the entire human review surface) is not built `[from-code + from-doc]`
- `CONTEXA-DESIGN.md:169-187` / `CONTEXA-IMPL.md:428-435` design a read-only Hono web app whose
  **Knowledge page = memory browser + review queue (`needs-review` entries) + push pin/veto state +
  stale-references list**.
- Code: `ctx guide` is not a command; `cli.ts` HELP says "guide/import land in later M1 slices"
  (`cli.ts:322`) and the default branch returns a stub notice (`cli.ts:368-375`). No `packages/*`
  ships a guide server. So the designed human memory-management UI is **design-only**. `[from-code]`
- Consequence for Decision 9: `needs-review` has no producer AND no consumer UI today.

### 2.5 Additional host importers (Codex, VS Code Copilot) not built `[from-doc]`
`CONTEXA-IMPL.md:293-303` + P28③ (`FABLE-DECISION-LOG.md:239-249`) scope VS Code Copilot and Codex
importers as independently-mergeable follow-ons; only Claude Code exists in code. "cross-host
dedup" (`CONTEXA-DESIGN.md:163`, `CONTEXA-IMPL.md:304`) therefore cannot happen — the only dedup that runs
is **within a single Claude import batch** (`claudeImporter.ts:236-263`).

### 2.6 `human-note` origin + `session_ref` auto-capture unimplemented `[from-code]`
- `human-note` appears only in the type union + a SQL comment (`store/types.ts:125`,
  `001-init.sql:58`); no code path emits it (grep: 2 matches, both declarations). Human notes are
  in practice `remember()` with default Confirmed authority.
- `session_ref` is accepted by `remember()`/`writeMemory` but the CLI/MCP never populate it; the
  design source (compressor capture tap contributing `sessionRef`, `CONTEXA-DESIGN.md:204-206`,
  `CONTEXA-IMPL.md:473-474`) is the off-critical-path adjacent track, not built.

### 2.7 `sameAsCandidate` dedup proposals are never surfaced `[from-code, MEDIUM]`
The importer emits `sameAsCandidate` as a claim+link (`claudeImporter.ts:244-261`) but **never
calls `addConflict`** — the only `addConflict` caller is docs stale-suspect
(`ingest/docs.ts:371`). Serving surfaces conflicts by reading the `conflicts` table
(`engine.ts:113-138`), so a near-duplicate proposal is an invisible low-confidence link, shown to
neither push nor pull. `sameAsCandidate` is a declared `ConflictKind` (`store/types.ts:115`) that
memory never files. `[from-code]` Design intent was "conflict surfacing"/"鉴真 reuse" for dedup
(`CONTEXA-DESIGN.md:163`, P16②).

### 2.8 Lifecycle status does NOT gate the pull/serve path `[from-code, HIGH — subtle]`
`setMemoryStatus` only ever moves a row to `superseded` (via supersede) or to
`retired`/`needs-review`/`active` (via the CLI) — grep confirms two writers
(`remember.ts:236,351`). But **only `listMemories` and push filter by status**; the selection
engine (`seeds.ts`, `engine.ts`, `sections.ts`) filters memory **only by
`gen<=published_gen`** (`visibility.ts:44-52`), never by `status`. A `retired` or `superseded`
memory keeps its published `gen`, stays FTS-indexed, and therefore **remains retrievable by
`context()`/`search()`**. "Forgetting" today = hidden from the list + push, **not** from pull.
`[from-code; inferred consequence]` (Design intent `CONTEXA-DESIGN.md:123-124`: "confidence stays a
soft factor … the only hard filter remains explicit user evidence-policy" — status was never
specified as a serve filter, so this is under-specified rather than contradicted.)

---

## 3. Hard invariants (enforced in code) vs merely stated

### Enforced in code `[from-code]`
| Invariant | Enforcement site |
|---|---|
| **Zero egress at serve+ingest** | `assertNoEgress()` throws if `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` set; wired at every serve entry (`serve/serve.ts:182,231,296`) and `ctx mcp` startup (`mcp.ts:213`). `serve/egress.ts:22-35`. |
| **No LLM / no embeddings / no network at write or serve** | Structural: nothing in `memory/`, `push/`, `select/` imports a model client; dedup is Jaccard/entropy (`dedup.ts`), ranking is arithmetic (`select/rank.ts`). `[from-code + inferred]` |
| **Gist ≤240 chars** | `remember()` pre-check (`remember.ts:138`) + store `RangeError` backstop (`store.ts:337-343`). |
| **Push block ≤1KB** | By construction in `renderPushBlock` (`block.ts:94-102`); property test over 1000 sets incl. multibyte (`1h-push.test.ts:102-124`). |
| **Index-not-copy, with memory as the sole exception** | Non-memory entities store `locator` only; memory gist/detail live in the row (`store.ts:629-643`, `CONTEXA-IMPL.md:135-136`). |
| **Claims append-only** | No update/delete claim API on the `Store` interface (`store.ts:79-80`). |
| **Paths persisted project-relative; no write escapes project root** | `scrubToProjectRelative` (`store.ts:135-142`); push placement guard (`hosts.ts:69-74`); anchor path-traversal guard (`remember.ts:122`). |
| **Readers see only published generations** | `gen<=published_gen` everywhere reads (`visibility.ts`, `remember.ts:377`). |
| **Non-destructive dedup** | `fuzzyDuplicate` returns a verdict; callers only emit `sameAsCandidate` (`dedup.ts:11-13`, `claudeImporter.ts:244-261`). |
| **Host import never writes under `~/.claude`** | Importer only reads the host dir, writes the passed store (`claudeImporter.ts:19-21`); G-7 sandbox tests. |
| **Recoverable conditions are success-shaped, never `isError`** | `remember`/`recall`/config all return `{ok:false, guidance}` values (`remember.ts:43-58`, `config.ts`); serve reserves `isError` for malformed args / corruption (`serve/serve.ts:85-104`). |

### Stated but NOT enforced (or only partially) `[from-doc / from-code gap]`
| Claim | Reality |
|---|---|
| "conflicts surfaced, not averaged" (per fact) | True for docs stale-suspect + selection; **memory `sameAsCandidate` is never filed as a conflict** (§2.7). |
| "provenance per fact" | True — `anchoredTo`/`supersedes`/`sameAsCandidate` carry carrier/method/authority (`remember.ts:212-220`); but a memory *row* itself is not a claim, so its own authority/status live in the side table, not the append-only ledger. `[inferred]` |
| Push rank "authority×usage×recency×anchor-freshness" | Only authority×recency (§2.2). |
| "anchor changed → needs-review" | Not implemented (§2.3). |
| "always Inferred host imports" | True (`inferred`), but design never actually mandated `needs-review` for imports — imports land **`active`** (§2.1, Decision-8 open). |

---

## 4. Pending decisions / open registers visible in code or docs

- **A11 (perf gates)**, not a memory scenario: `A11-dirty <20ms`, `A11-serve <150ms`, `A11-size
  <5%` (`M1-ACCEPTANCE.md:114-125`); task/NL serve (~615-670ms) + size are **recorded-not-enforced**,
  optimization deferred to **M5** (`M1-ACCEPTANCE.md:118-125`). The MEMORY.md index note "A11@M5"
  = this perf-gate deferral. `[from-doc]`
- **`listMemory` API register**: `listMemories` opens a **second read-only `DatabaseSync`** on the
  store's WAL db because the pinned `Store` interface has **no enumeration method**
  (`remember.ts:355-393`; interface `store.ts:61-132` — only `getMemory`/`writeMemory`/
  `setMemoryStatus`). Flagged as an open API decision in project memory. `[from-code + from-doc]`
- **Push discoverability / restatement-gist demotion (G3, F4)**: the DORA review already logs that
  P21's auto-rank can let low-value restatement gists ("this project uses React/pnpm") occupy the
  ≤1KB floor, with "discoverability demotion (G3)" as an open action
  (`docs/design/FABLE-DORA-REVIEW.md:156,197,224`). Directly informs Decision 7. `[from-doc]`
- **M2-deferred memory work**: anchor-invalidation → needs-review, `signature/body-changed` reason
  classes (`M2-GOAL-PROMPT.md:57`, `CONTEXA-IMPL.md:540-544`). `[from-doc]`
- **Host-import default status** is an explicitly open research question, not a settled code fact:
  `MEMORY-RESEARCH-GOAL-PROMPT.md:99` "Should host-imported memory default to `needs-review`
  instead of `active`?" Code chose `active`. `[from-doc]`
- **`served_count`/`last_served`**: latent schema, no writer — a half-built usage signal
  (`001-init.sql:62-63`). `[from-code]`
- **In-code TODO/scope markers** touching memory: `sentinel.ts:7` (paraphrase echo out of M1
  scope), `adapter.ts:21` ("not reached by serve-time refresh"), `engine.ts:381,386`
  (`!callers/!callees/!diff` facets need M2). Very few — the code encodes scope in prose comments,
  not TODOs. `[from-code]`
- **Other open registers named in project memory** (git-evidence `target-removed`, import
  timestamps) are docs/git-source concerns, not memory-core. `[from-doc]`

---

## 5. Entanglement map (where memory couples to each subsystem)

Memory is deliberately thin; its couplings are almost all *inbound* uses of shared store
primitives. `[from-code]`

- **↔ Store** (tightest): memory owns 3 tables (`memory`, `anchors`, plus `mem:` rows in
  `entities`) and 5 `Store` methods (`writeMemory`, `getMemory`, `setMemoryStatus`, `setAnchors`,
  `anchorsOf`, `store.ts:95-100`). Read-through for `{t:'store'}` locators special-cases memory
  (`store.ts:629-643`). The 240-cap backstop lives in the store (`store.ts:337-343`). **No
  enumeration method** — the boundary leak that forces `listMemories`' second connection
  (`remember.ts:363`).
- **↔ Claims** (append-only ledger): `remember()` writes `anchoredTo` + `supersedes` claims;
  the importer writes `sameAsCandidate` claims (`remember.ts:212-245`, `claudeImporter.ts:244-252`).
  Carriers `remember` / `host:claude-code`; methods `explicit-key` / `semantic-proposal`.
- **↔ Links** (resolved view selection reads): the same three predicates become links
  (`remember.ts:221-227,246-252`; `claudeImporter.ts:253-260`). This is how memory joins the graph
  the selection engine walks. Predicate confidence floors for memory edges live in
  `select/constants.ts:68-70` (`anchoredTo`/`supersedes` = 1.0).
- **↔ FTS**: every memory is contentless-FTS-indexed on write (`remember.ts:229`,
  `claudeImporter.ts:226`) — the single cross-source index (`001-init.sql:71-75`) is why memory
  competes lexically with code/docs.
- **↔ Selection** (`select/`): memory-specific logic is confined to two functions in
  `select/rank.ts` — `decayBasis` (anchoredTo-recency, else `last_verified`, `rank.ts:43-52`) and
  `authorityBoost` (confirmed×1.3, `rank.ts:76-80`) — plus one bucket in `sections.ts:54-55`
  (10% budget) and one facet branch in `engine.ts:348-359`. Everything else (seeds, PPR, RRF,
  borrowing) treats memory generically. **Selection does not read memory `status`** (§2.8).
- **↔ Push** (`push/`): `push/rank.ts` imports `listMemories` (`memory/remember.ts`) + the two
  `select/rank.ts` primitives (`rank.ts:16-17`) — push is a *second, simpler* memory-ranking path
  reusing the same scale. `push/block.ts` imports the sentinel constants from `memory/sentinel.ts`
  (`block.ts:21`) to wrap the managed block (closing the echo loop the importer strips).
- **↔ Ingest/refresh** (`ingest/`): `MemorySourceAdapter` (`memory/adapter.ts`) implements the
  generic `SourceAdapter`, registered in `ingest/registry.ts:26` — but its always-clean dirtyCheck
  detaches it from the refresh engine (§2.1). Memory is the one source that is in the registry yet
  never orchestrated.
- **↔ Guide** (`ctx guide`): **no coupling exists** — the guide is unbuilt (§2.4).
- **↔ Serve/MCP**: `serve/serve.ts` re-exports `remember()` as the `remember` tool
  (`serve.ts:295-331`); `context`/`search` reach memory only through the generic selection engine.
  `assertNoEgress` gates all three (`serve.ts:182,231,296`).

---

## 6. Mapping to the 10 research decisions

1. **Memory's job / separability** — Memory is a **thin authoring/import layer over the shared
   graph**, not a subsystem: one kind + one side table + two writers (`remember`, importer) + two
   ranking primitives. `[from-code §0,§1,§5]` Its only exclusive machinery is the 240-cap, sentinel
   strip, and dedup verdict.
2. **Failure priority (implied by code investment)** — Hard-defended: **privacy/egress**
   (`assertNoEgress`) > **host-echo-loop** (sentinel, exact-match) > **duplicate** (dedup, but
   import-only) > **irrelevant-push** (volume-capped, no quality filter). Undefended today:
   **false, stale, missing, unreviewed-import, unanchored** (all allowed). `[inferred from §1-3]`
3. **Write policy** — Effectively **manual-first with evidence gates** (anchors must resolve, gist
   cap, all-or-nothing) at `confirmed` authority; the only automatic path (host import) has **no
   trigger** so no automatic creation actually occurs. No review gate on writes. `[from-code §1.2,
   §2.1]`
4. **Lifecycle / retention** — 4 statuses exist; only `superseded` (auto, via supersede) and
   `retired`/`needs-review`/`active` (manual CLI) are reachable; **no auto → needs-review**.
   "Forgetting" hides from `list`+push but **not from pull** (§2.8), and nothing is ever deleted →
   unbounded store growth. `[from-code §1.4,§2.3,§2.8]`
5. **Anchoring / freshness** — Anchors resolve all-or-nothing at write with file auto-create;
   **zero freshness behavior** post-write in M1 (no drift check, decay uses anchor *write*-time not
   liveness); anchor-invalidation is M2. `[from-code §1.2,§2.3]`
6. **Retrieval / ranking** — Memory competes via the full generic engine (FTS→PPR→RRF→sections,
   10% budget) using two justified deterministic signals (**authority×1.3, time-decay**); push uses
   the same two. Dangerous/absent signals: usage (unwritten), anchor-freshness (absent), and
   status-gating (absent — retired memory still served). `[from-code §1.8,§1.9,§2.2,§2.8]`
7. **Push digest** — Fixed 2-line header + top-N active gists + `[handle]`, ≤1KB by construction,
   pin/veto (veto wins), no served-count. Exclusion today = veto + byte budget + `status!=active`;
   **no relevance/restatement filter** (open G3/F4). `[from-code §1.8; from-doc §4]`
8. **Host composition** — Import Claude Code only; strips exact sentinel; lands `authority:inferred`
   but **`status:active` (not needs-review)**; within-host dedup only, non-surfaced. Cross-host and
   paraphrase-echo prevention unbuilt. Whether imports should default to `needs-review` is an
   explicit open question. `[from-code §1.5,§2.5; from-doc §4]`
9. **Human vs agent consumers** — Agents (MCP): `context`/`search`/`remember` — write+read, no
   lifecycle. Humans (CLI): `remember`/`recall`/`memory list|confirm|retire|review`/`push pin|veto`.
   The designed human review UI (`ctx guide` Knowledge page) is **unbuilt**, so `needs-review` has
   no consumer. `[from-code §1.4,§1.9,§2.4]`
10. **Evaluation** — Contract encoded as living-repo + fixture acceptance scenarios
    (A1-import/echo, A2-remember/supersede, A6-decay, A9-budget/pin-veto/idempotent, G-1..G-9) plus
    a 1000-set push property test. No memory-specific token-saving or quality/relevance eval exists.
    `[from-doc/from-code §4; M1-ACCEPTANCE.md, 1c/1h/global-invariants tests]`

---

## 7. Top 3 design↔code gaps (ranked)

1. **Host import is unreachable** (§2.1): always-clean dirtyCheck detaches the only auto-write path
   from every orchestration; the CLI advertises an import that never runs. Undercuts Decisions 3 &
   8 empirically.
2. **Push ranking is authority×recency, not the ratified authority×usage×recency×anchor-freshness**
   (§2.2): two of four factors are latent (`served_count`) or absent (anchor-freshness). Directly
   Decision 6 & 7.
3. **Lifecycle status doesn't gate pull serving** (§2.8): retired/superseded memory stays
   retrievable via `context()`/`search()` — "forgetting" is incomplete. Decision 4 & 6.

Honorable mentions: no anchor-freshness of any kind in M1 (§2.3, M2-deferred but total); dedup
proposals invisible (§2.7); the entire human review surface unbuilt (§2.4).

---

## 8. Seed observations — verification verdicts

**All 15 seed observations were CONFIRMED against code.** Corrections/extensions where a seed was
imprecise or understated:

- *"dedup runs for memory/concept only"* — precise: `dedup.ts` is caller-gated and **only the
  Claude import batch calls it**; concept dedup is never wired, and `remember()` never dedups. So
  in practice dedup runs for **within-host imported memory only**. (Seed's core claim — "remember()
  does NOT call dedup, manual writes can silently duplicate" — is **correct**, `remember.ts` has no
  dedup path.)
- *"push rank has NO served-count signal"* — correct, but note the **schema has `served_count`/
  `last_served`; they are simply never written** — a latent half-feature, not absent by design.
- *"adapter dirtyCheck always clean → no serve-time anchor-freshness re-check"* — correct **and
  understated**: the always-clean check also means the refresh engine **never calls memory
  `ingest()` at all**, so host import runs on no user path (§2.1). The adapter's own comment
  ("exposed only for an explicit cold-path host import", `adapter.ts:21`) is **inaccurate** — no
  cold path invokes it.
- *"claudeImporter sets status: active (NOT needs-review)"* — confirmed exactly
  (`claudeImporter.ts:224`); worth pairing with the fact that the **design text never mandated
  needs-review for imports** either (it says "always Inferred") — so this is an *open decision*, not
  a code-vs-design contradiction.
- *"listMemories opens a second connection; Store interface lacks enumeration"* — confirmed exactly
  (`remember.ts:363`; interface `store.ts:61-132`).

No seed observation was found factually wrong.
