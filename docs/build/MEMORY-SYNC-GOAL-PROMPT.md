# Context Ownership & Sync Model — Decision-Anchored Change Prompt

> **Origin.** This prompt follows the memory research (`docs/design/memory-research/`) and a design
> conversation that surfaced a gap the research did not cover: ctx's thesis is **project-owned
> context** (`VISION.md` — one base, projected per task, serving human and agent; memory is Project
> Mainline, not assistant-private), yet the current M1 implementation stores authored memory only in a
> per-laptop `~/.ctx/…/store.sqlite`, never committed. So "project memory" is today aspirational for the
> one content class that is authored, not derived — and it structurally diverges across people/branches.
>
> **Scope note (widened).** Memory is the concrete *driver*, but sync/ownership is a **cross-cutting**
> property of **every** content type × carrier. Load-bearing principle: **ownership/sync policy is a
> property of the CARRIER (where the authoritative bytes live), not of the content type.** This prompt
> settles a **per-carrier ownership & sync model** (three categories — see S8), of which file-backed
> memory is one case, and reconciles the three doc layers (VISION / CTX-DESIGN / CTX-IMPL).
>
> **Source of truth for rulings:** `docs/build/MEMORY-DECISIONS.md` (B1 / A1–A7 / C1–C5 / D1–D4 /
> **E1–E8**). This prompt *references* those rulings; it does not restate them. Where it once described
> a sub-decision as open, and the E-group has since ruled it, the prompt points there.

## Role

You are a skeptical implementer-architect. Settle the still-open mechanics, keep the design docs
consistent with the thesis, then scope the code change into reviewable slices with an acceptance bar.
Do not relitigate anything the DECISIONS file has ruled.

## Unified event model (the load-bearing frame — read this first)

Every memory write — `remember()`, host import, a lifecycle verb (`confirm/retire/supersede/dismiss`),
or a conflict resolution — is an **immutable event**. Each event lands in **exactly one of three
zones**:

1. **Committed Mainline log** — `.ctx/` files, git-synced, shared with the team.
2. **Personal overlay** — gitignored, per-person, never shared (session/task memory, my-view attention,
   host imports awaiting confirmation).
3. **External snapshot** — `~/.ctx/…/snapshots/`, a dated cache of an external system-of-record, never
   committed.

**Status** (`active` / `needs-review` / `superseded` / `retired`) is a **deterministic fold over the
events**, in total order `(event timestamp, then ULID)` (E2/E5), never a mutable column. **`store.sqlite`
is a rebuildable materialized view** over the events + derived indexes. Given this frame, the earlier
open items **S1** (file format), **S2** (decision-log format), **S5** (gitignore surface) and **S7**
(overlay mechanics) reduce to **serialization/layout consequences** of the event model, not independent
questions — settle them as such.

## Hard invariants (every change must respect them)

No LLM / no embeddings / no network at write or serve time. One local SQLite+FTS5 index per project.
Provenance per fact. **Conflicts surfaced, never auto-merged.** Zero egress. Superseded/retired kept,
never deleted.

**Clarified invariant:** "local" means *never egressed / no org-server memory* — it does **not** mean
*un-shared*. Durable project memory committed into the project's own git repo is still local and
zero-egress. (`VISION.md` invariant 3 to be reworded to say this.)

**New invariant (E3):** **committed = human-authored or human-confirmed.** Auto-generated content (host
imports, agent `remember`) enters git only after a human confirms it; until then it lives in the
personal overlay as `needs-review`. This simultaneously closes the echo loop and the privacy hole.

**New invariant (E4):** **a deterministic secret-shaped guard runs before anything enters the committed
zone.** Regex classes (`sk-` keys, tokens, passwords, credentials) → success-shaped refusal with
guidance, never a hard error. There is no LLM/network to lean on, so the guard is deterministic.

## Ratified decisions (implement these; do not relitigate)

1. **Derived vs authored split governs sync.** Derived content (code, git, decisions-from-ADRs, doc
   knowledge) is a deterministic index of shared git state — a cache, **never synced**, regenerated
   locally. `store.sqlite` is therefore rebuildable and **gitignored** (commit sources, gitignore the
   index — `src/` vs `dist/`). Authored content (memory, concepts) is the only class with a real sync
   problem.

2. **Durable memory = committed files; store = rebuildable index over them.** Durable project memory
   moves out of store-as-source-of-truth into committed repo files (`.ctx/memory/`). The `memory` table
   becomes a derived index. **Memory + concepts leave the "index-not-copy exception"** — reconcile that
   exception in `CTX-DESIGN.md §3` / `CTX-IMPL.md §2`.

3. **Git is the sync layer; the conflict model is three-layered (E1).** Clone = get the memory;
   pull/push = sync; branch = that branch's memory; merge to main via PR. Git handles **only the textual
   layer** (bytes). It is **not** the semantic conflict surface:
   - **Textual** (git): concurrent appends. With the E2 `merge=union` log these auto-merge, so a git
     conflict signals byte collision, not contradiction.
   - **Identity** (reindex): duplicates → `sameAsCandidate`, filed at reindex.
   - **Semantic** (post-merge reindex reconcile): a contradiction between two memories → a **conflict
     filed at reindex**, human-resolved via the committed decision log.
   A clean git merge can still carry a semantic contradiction; that contradiction is caught by the
   post-merge reconcile, **not** by git. Do not describe git as surfacing semantic memory conflicts.

4. **Durable (Mainline) vs ephemeral (Overlay) split.** Durable → committed, shared. Session/task memory
   ("true right now and only for me") → personal overlay, deliberately divergent, never synced. The
   model must physically separate them so ephemeral memory never lands in a committed file.

5. **Conflict resolution is a committed decision fact, not a silent status flip.** A resolution or a
   lifecycle verb is recorded as an **append-only, provenance-carrying decision event** (who / when /
   verdict / reason); old memories are **kept**; status is **derived** from the decision, not
   overwritten. Resolutions are themselves supersedable.

6. **CLI lifecycle commands produce committable artifacts.** `ctx memory confirm/retire/…` and conflict
   resolution write a git-trackable change (a decision-log event / a memory file), **not** a hidden
   local-DB mutation. The write lands in git; `git pull` propagates it; each peer rebuilds their index:
   *surface → human resolves in CLI/git → committed decision → pull → reindex → conflict clears for the
   team, reason auditable by the team.*

   **Guide is a live interactive serve surface, NOT a static read-only export** (Hono loopback serving
   dynamic projections — Entity Biography, Search, graph exploration). "Read-only" is narrow = *non-
   mutating*, and bites specifically on **memory curation**: the Knowledge page *surfaces* the review
   queue / conflicts / stale list (and the `needs-review` ops signal, E8) and *displays* remediation
   commands, but the mutation happens via CLI/git. Everything else (browse, search, project, drill down)
   is active serve, not a passive dump.

7. **Three-tier visibility/scope.** (a) **Project truth** (confirm/retire/supersede/dismiss) → shared,
   committed. (b) **Project presentation** (push pin/veto, `.ctx/push.jsonc`) → shared (D27/D30). (c)
   **Personal attention** (my-view mute/pin) → gitignored personal overlay (`.ctx/*.local.*`); never
   forced on the team. Push ranking reads the shared config **merged with** the personal overlay.

## Open sub-decisions to settle (diverge, then converge with a recorded reason)

> **Ruled by DECISIONS.md — do not re-open, only work the mechanics:** S1 ← **C1** (append-only markdown,
> one entry/line; settle only multi-line `detail` attachment), S2 ← **C2** (append-only markdown log),
> S6 ← **C3** (concepts follow memory now), bitemporal `valid_from/valid_to` ← **C5**, import host
> auto-memory ← **A3**, **and second-round: S2/S5 event-log mechanics ← E2, import landing zone ← E3,
> secret guard/default scope ← E4, decision-collision fold ← E5, determinism target ← E6.** Everything
> the E-group settled is closed here.

Still genuinely open (enumerate options, pick one, say why — constrained only by the invariants +
ratified decisions):

- **S1 (residual).** Only the multi-line `detail` attachment for a one-line memory entry — inline
  pointer to a sidecar block vs a fenced continuation — without breaking append/merge-friendliness.
- **S3. Migration.** Existing store-only memories (M1) → committed files: one-shot export + reindex;
  idempotent; preserves ids (`mem:<ulid>`), authority, status, anchors, provenance.
- **S4. Cross-branch anchor semantics.** A memory anchored on branch A where code diverged on branch B —
  how anchor-freshness reads across branches/merges. This rides the M2 anchor-freshness pass; specify
  the contract, do not block the file model on it. (Note: the *within-branch* trigger already exists —
  see Current-code alignment.)
- **S8. Per-carrier ownership & sync matrix (the widened core).** Three categories — assign each carrier
  to one and record why:
  - **① Derived-from-committed-source** (code, git, ADR/design-doc/commit decisions, local doc/domain
    knowledge): source of truth = git; store = deterministic cache. **Never synced; regenerated
    locally; `store.sqlite` gitignored.** No divergence by construction.
  - **② Authored-local** (memory; concepts per C3): source of truth = committed `.ctx/` files. **git +
    PR; conflicts per the E1 three-layer model** (textual→git, semantic→post-merge reconcile).
  - **③ External system-of-record** (GitHub PR threads, Jira, Confluence, any credentialed carrier):
    source of truth = the **external** system. ctx holds a **dated local snapshot = cache of an
    external SoR**. **Re-import per person (credentialed), never committed/mirrored** (`VISION.md`
    invariant 4; plus staleness + credential-leak risk); **freshness = snapshot age**. Teammates
    reconcile with the external system, not with each other via git. Snapshots live under
    `~/.ctx/…/snapshots/`, not repo-committed.
  - Driver, explicitly: **a meeting recap imported as a committed local file is ①/②; the same recap
    fetched from Confluence is ③** — same content, different carrier, different policy. This is why the
    matrix is carrier-keyed.
- **S9. External-source sync + cross-source anchor resolution.** (a) Category-③ carriers re-import per
  person, gitignored; surface import cadence/credentials (import = explicit cold-path action, no
  network at write/serve). (b) **Cross-source anchors:** a *committed* memory (②) may anchor a
  *non-committed* entity (a Jira story / PR, ③, or a per-branch symbol). On a peer that has **not**
  imported that snapshot the anchor **does not resolve**, but the target is **not gone** — so this is
  **NOT** `stale-suspect`. Define a distinct **`unresolved-here`** state ("anchor unresolved on this
  machine — run `ctx import <carrier>`"), kept separate from anchor-drift so a missing local import is
  never mistaken for a stale fact.
- **S10. Performance & incrementality budget (must not regress A11: dirty <20ms, serve <150ms).**
  - **Memory dirty-check must be incremental**: mtime-first, checksum only on mtime change over
    `.ctx/memory/`; a directory-mtime / manifest short-circuit so an unchanged tree costs ~one stat.
  - **Anchor re-verification is change-set-bounded** via the reverse `dependency_index` (indexed lookup
    keyed by changed symbols), never a scan over all memory. Assert at scale.
  - **Reindex on `git pull`** is proportional to the pulled delta, not the whole `.ctx/memory/`.
  - **Status fold** must not replay the whole log per query — cache derived status in the (rebuildable)
    index; the log is the source, the index is the fast read.
  - Residual open Q: exact dirty-check cadence on the query hot path (per-query vs per-process gate vs
    interval) — inherit M1's first-call catch-up gate, do not add a watcher.

## Current-code alignment (anchor-freshness is PARTIALLY built — do not describe it as unbuilt)

Verified on `feat/1.0.0`:

- **Landed (slice 2c):** `flagAnchorDrift` (`packages/core/src/ingest/code/incremental.ts:249-293`)
  detects reason-classed symbol-anchor drift (`signature-changed` / `body-changed` / `target-removed`)
  on code re-ingest and flags anchored memory. This is the seed of the S4 anchor-freshness pass and the
  S10 change-set-bounded re-verification — **build on it, do not re-write from scratch.**
- **Landed (2c/B6):** the `⚠ <status>:` drift-honest projection for non-active memory
  (`packages/core/src/select/project.ts:89`).
- **Two M1 bugs still open** (Phase-1 fix scheduled; reframed by slices 2 & 4): status does not gate pull
  (`select/visibility.ts:44-52`, gen-only), and host import is unreachable (`memory/adapter.ts:17-19`
  hard-codes `dirtyCheck` clean → `ingest/refresh.ts` never re-ingests memory; `packages/cli/src/cli.ts`
  `cmdImport` prints the false "imported automatically on cold-path sync"). Also: `claudeImporter.ts:224`
  lands imports `status:"active"` and `push/rank.ts` (~80-85) force-includes non-active pinned memory.
- **Scheduled fixes to the landed 2c code (E7 — schedule, do not fix here):** (a) `body-changed` →
  down-rank only per A5 (today `flagAnchorDrift` flips **all three** classes to `needs-review`, line
  279); (b) drift must **also file a reason-classed `stale-suspect` conflict** via `addConflict` — today
  it only writes a `stale-reason` *claim* (`addClaim`, lines 280-289), so drift is invisible to
  `conflictCandidates()` and the guide stale-list (`addConflict` is called for doc mentions only,
  `ingest/docs.ts:403`); (c) verify/add `file:`-anchor `target-removed` coverage (file deleted).

## Required doc reconciliations (do these before/with the code)

- **`VISION.md`** — reword invariant 3 (local ≠ un-shared); make the Mainline/Overlay split explicit for
  memory; name git as the memory sync/collaboration layer (textual only, per E1).
- **`CTX-DESIGN.md`** — §3: memory (+concepts, C3) join index-not-copy indexing `.ctx/memory/`;
  `store.sqlite` gitignored; list committed files (`.ctx/memory/`, decision log, `push.jsonc`) vs local
  cache/overlay/snapshots; add `valid_from/to`. **Add the S8 per-carrier matrix as a first-class table.**
  §2: network carriers are ingress-only dated snapshots, never committed (③). §6: guide = live serve,
  "read-only" = non-mutating, bites on memory curation. §8 (D27): concrete per-carrier sync + three-tier
  scope. §9: register; add the two new invariants (E3/E4) + the E1 conflict model.
- **`CTX-IMPL.md`** — §2 schema: `memory` table → derived index; §5.6: `remember()` / importer write
  events + decision-log; lifecycle appends decisions; §7: push reads shared+personal. Record
  `unresolved-here` (S9) alongside `stale-suspect`, and the secret guard (E4).
- **`FABLE-DECISION-LOG.md`** — a new decision (next P-number) + the clarified/added invariants.
- **`docs/design/memory-research/REPORT-canonical.md`** — Decision 11 (collaboration & sync) + the
  committed-sync invariant (the ten decisions did not cover multi-user sync). *(The 2c reality note is
  already added.)*

## Implementation slices (risk-ordered; each independently reviewable, tests green before the next)

Ordered so the **event log lands before the storage move** — the storage swap then becomes mechanical.

1. **Docs + decision record** (this prompt + DECISIONS E-group). Settle S1(residual)/S3/S4/S8/S9/S10;
   reconcile all doc layers; sharpen the guide framing. **No code.**
2. **Event/decision log + derived status, on the CURRENT storage.** Lifecycle verbs + conflict
   resolution append immutable events; `active/needs-review/superseded/retired` derived via the E2/E5
   fold. Selection reads derived status → **subsumes/reframes Phase 1 item 1 (status-gate-pull)**: the
   selection status filter is reused; only the status *source* changes to the fold
   (`select/visibility.ts:44-52`). Independently revertible; no storage-locus change yet.
3. **Storage locus swap.** Memory + the event log move to committed `.ctx/` files; the store becomes an
   index; migration (S3). **Mechanical, because the event model already exists** — this slice only
   changes *where the events live*. Highest risk → gets the deepest joint-review round (see Execution model).
4. **Memory as a real dirty source + import→overlay→confirm pipeline.** `memory/adapter.ts` `dirtyCheck`
   = mtime/checksum over `.ctx/memory/`; refresh ingests it. Host imports land in the **personal
   overlay** as `needs-review` (E3); confirmation promotes them to a committed Mainline event. **Subsumes/
   reframes Phase 1 item 2 (import-unreachable)**: the mtime dirtyCheck converges into the file-source
   model; landing zone per E3; false CLI text fixed if Phase 1 has not. Secret guard (E4) on this path.
5. **Personal overlay + three-tier scope.** Shared `.ctx/push.jsonc` merged with the gitignored personal
   overlay; project-truth decisions shared, personal attention local; `remember() --local`.
6. **Collaboration eval.** Extend the E-series with a **two-working-copy** fixture:
   - **merge-clean-but-contradictory (E1):** two branches with contradictory memories merge **cleanly**
     in git; the **post-merge reindex MUST file the contradiction as an open conflict** — the case git
     cannot test.
   - convergence: A commits a memory + a resolution, B pulls, both reindex to canonical logical equality
     (E6, not byte-identical).
   - overlay-never-committed; secret-guard-effective; the E5 decision-collision fold (later-by-total-
     order wins + contradiction conflict filed).

## Execution model (hard requirement)

- **Subagent-driven.** Each slice is executed by **one implementer subagent (Opus)** with a tight
  per-slice goal prompt that **REFERENCES this doc + `MEMORY-DECISIONS.md`** rather than restating them.
- **No dual-track (maintainer-ratified 2026-07-05).** Opus implements every slice single-track.
- **Review = Fable + Codex jointly.** Fable (the session model) verifies tests green, checks the
  invariants (egress, non-destruction, determinism), and reads the diff; Codex reviews the same diff
  as an adversarial second opinion. Opus applies fix rounds until **both** reviewers pass. Reviewers
  do not implement.
- **Token discipline.** An implementer reads **only the files its slice names**. Acceptance = the
  **E-series tests**, not prose review. **Each slice's tests are green before the next starts.**

## Interactions to exploit (don't re-solve separately)

- **Relationship to the two verified M1 bugs** — these are fixed **surgically in Phase 1**
  (`MEMORY-EXECUTION-PLAN.md` items 1–2), independently and first, on the current storage model; do
  **not** gate those correctness fixes on this re-architecture. Slices 2/4 then **reframe** them (status
  source → the E2/E5 fold; import landing zone → the E3 overlay) and **reuse** Phase 1's status filter +
  mtime dirtyCheck, never re-solving. Fallback: if Phase 1 has not shipped, slices 2/4 subsume the fixes.
- **Removes an invariant exception** — memory/concepts leaving index-not-copy is a *simplification*.
- **Cross-branch anchor freshness rides M2** (S4) — specify the contract now; the file model ships
  without waiting for it. The *within-branch* trigger already exists (`flagAnchorDrift`).

## Acceptance bar

- A peer who `git clone`s the repo gets durable project memory + resolutions; a session-memory note
  **never** appears in a committed file; a host import never enters git until a human confirms it (E3).
- **Deterministic reindex = canonical logical equality (E6):** same commit → a normalized dump (rows in
  deterministic order) compares equal across machines. **Not** byte-identical `store.sqlite` (physically
  impossible); `store.sqlite` is gitignored.
- A conflict resolved by a human is a committed, provenance-carrying, supersedable decision event; old
  memories retained; status derived, not overwritten.
- **Conflict surfacing (E1/E5):** two branches with contradictory memories **merge cleanly in git**, and
  the **post-merge reindex files the contradiction as an open conflict**; on conflicting lifecycle
  decisions the later-by-total-order decision wins for derived status **and** a contradiction conflict is
  filed. Nothing is auto-merged.
- **Secret guard (E4) effective:** a memory carrying a secret-shaped token is refused (success-shaped,
  with guidance) before it can enter the committed zone.
- **Overlay never committed:** personal attention (mute/pin-in-my-view) and unconfirmed imports never
  mutate the shared config or land in git.
- **Every carrier is assigned to exactly one S8 category and behaves per its policy:** ① regenerates
  locally (gitignored index), ② git-syncs, ③ re-imports per person and is never committed.
- **Cross-source anchor (S9):** a committed memory anchored to a not-locally-imported external entity
  reads as `unresolved-here` (with an import hint), **never** as `stale-suspect`.
- **Guide:** serves dynamic projections interactively; only memory-curation mutations are refused
  (routed to CLI/git); surfaces the `needs-review` queue size + oldest-item age (E8); not reducible to a
  static export.
- **Performance (A11 not regressed):** the added memory dirty-check is incremental (mtime-first,
  checksum-on-change; unchanged `.ctx/memory/` ≈ one stat); anchor re-verification is change-set-bounded
  via the reverse index; derived status is read from the cached index, not by replaying the log per
  query; a clean refresh serves the cached generation with zero re-parse. Dirty <20ms / serve <150ms
  hold on a large fixture.
- The two M1 bugs (status-gate-pull, import-unreachable): **closed by Phase 1 and reframed by slices 2
  & 4** (or subsumed by them if Phase 1 has not shipped), with the E-series tests that encoded them green.
- No LLM / embeddings / network anywhere; zero egress; every doc layer (VISION/CTX-DESIGN/CTX-IMPL/
  decision-log/canonical) tells one consistent story.

## Deliverables

1. The reconciled docs + the decision record (slice 1), **including the S8 per-carrier ownership matrix**.
2. The settled S-items with recorded rejected options (Rule-9 style).
3. The implementation across slices 2–6 with the E-series collaboration tests.
4. A short migration note for existing store-only memory.
