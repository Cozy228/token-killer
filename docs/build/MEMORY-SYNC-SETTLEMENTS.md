# Memory Sync — Settled S-items (slice-1 deliverable)

> **Purpose.** Settle the still-open sub-decisions of the ownership/sync re-architecture:
> **S1-residual, S3, S4, S8, S9, S10.** Each is settled Rule-9 style — options enumerated (diverge
> first), one chosen with a recorded reason, rejected options kept with a one-line reason.
>
> **Authority.** Every settlement operates strictly **under** the maintainer rulings in
> `docs/build/MEMORY-DECISIONS.md` (B1 / A1–A7 / C1–C5 / D1–D4 / E1–E8) and the hard invariants of
> `docs/build/MEMORY-SYNC-GOAL-PROMPT.md`. A settlement works out mechanics only; it never re-opens or
> contradicts a ruling. Constraints = the invariants + the rulings, **not** the current implementation.
>
> **Frame.** The **unified event model** (sync prompt): every write is an immutable event landing in
> exactly one of three zones — ① committed Mainline log (`.ctx/`, git-synced), ② personal overlay
> (gitignored, per-person), ③ external snapshot (`~/.ctx/…/snapshots/`, dated cache of an external
> system-of-record). Status is a deterministic fold over events in total order `(timestamp, ULID)`;
> `store.sqlite` is a rebuildable materialized view.

---

## S1-residual — multi-line `detail` attachment to a one-line entry

**Operates under:** C1 (append-only markdown, one entry per line), E2 (line order non-semantic;
total order `(timestamp, ULID)`; `.gitattributes merge=union`; order-independent fold).

**Constraint that decides it:** under `merge=union`, git merges the log **line-wise** — it
concatenates the unique lines of both sides in an unspecified interleaving (E2: line order is
non-semantic). So any multi-line construct that lives *inside* the log file can have an unrelated
concurrent append land between its lines. A multi-line block must be **untearable** by that
interleaving.

**Options (diverge first):**
1. **Sidecar file per detail** — the log stays one physical line per entry (C1); the entry line
   carries an inline pointer token (`↳detail:<ulid>`) to a separate write-once file
   `.ctx/memory/details/<ulid>.md` holding the multi-line body.
2. **Fenced continuation** — the entry line is followed, in the *same* log file, by a fenced
   (```` ``` ````) block of detail lines.
3. **Inline-escaped single line** — gist + detail encoded on one physical line with `\n` escapes,
   so the whole entry is literally one line.

**Chosen: (1) sidecar file per detail, ULID-named, write-once.**
Reason: it is the only layout that satisfies **both** C1 (log strictly one-line-per-entry) **and**
E2 union-merge safety. The detail body is an immutable, uniquely-named file — a second writer never
targets the same `<ulid>.md` (ULIDs are unique per event) and never appends to it (an edit is a new
event → a new entry → a new sidecar, per Decision 5's append-only rule), so it cannot be torn or
interleaved by union merge, and two peers cannot collide on it. Arbitrarily large detail is allowed
without bloating the log line. Sidecars are never deleted (non-destruction invariant). For a zone-2
(overlay) entry the sidecar lives under the gitignored overlay path; for a Mainline entry it lives
under committed `.ctx/memory/details/`.

**Rejected:**
- **(2) Fenced continuation** — *tearable*: union merge is line-wise and E2 declares line order
  non-semantic, so a concurrent single-line append can legally land inside another writer's fence;
  the fence's structural integrity is not protected. Fails the deciding constraint.
- **(3) Inline-escaped single line** — *correct under merge but rejected on ergonomics*: detail is
  uncapped (only the 240-char gist is capped), so this produces unbounded single lines, wrecks
  diff/review readability (the committed log is human-reviewed, E3), and pushes newline-escaping into
  every reader/writer. Correctness-equivalent to (1) but strictly worse to live with.

---

## S3 — Migration (store-only M1 memory → committed files)

**Operates under:** B1 (file-backed re-architecture — clean cut, store becomes a rebuildable index),
C1/C2 (file + decision-log formats), E2 (event order), E4 (secret guard before the committed zone),
E6 (determinism = canonical logical equality). Non-destruction invariant. Preservation requirement:
`mem:<ulid>` ids, authority, status, anchors, provenance.

**Options (diverge first):**
1. **One-shot export + reindex, id-keyed & idempotent** — a cold-path exporter reads the M1
   `memory` rows, emits committed `.ctx/memory/` log entries + detail sidecars + synthesized
   decision-log events (to replay non-`active` status), then the store reverts to a pure index
   rebuilt from the files.
2. **Lazy dual-read migration** — keep the store as source of truth, migrate entries to files on
   first access.
3. **Manual re-author** — operator re-enters durable memories into the new model.

**Chosen: (1) one-shot export + reindex, id-keyed idempotent, run on first post-upgrade sync.**

Mechanics:
- **Trigger.** First post-upgrade cold path (`ctx sync` / `install` / `doctor`) detects the migration
  is due via a `meta` marker (bumped `schema_version` / `memory_migrated_at` unset) with store memory
  present and `.ctx/memory/` absent-or-partial.
- **Export per row, preserving everything.** For each `memory` row: emit one append-only log entry
  keyed by its existing `mem:<ulid>` (the ULID **is** the id — stable, preserved); write a detail
  sidecar (S1) when `detail` is present; emit anchor lines; carry `authority` and provenance claims
  (carrier/locus/method/at) verbatim. **Status is replayed, not copied:** any status that is not
  `active` is written as a synthesized decision-log event (provenance `carrier=migration`, `at` =
  the original transition time if known, else migration time) so the E2/E5 fold reproduces the same
  derived status. `valid_from/valid_to` (C5) carried when present, never inferred.
- **Idempotent + resumable (defines no-op re-run and dirty half-migrated state).** Emission is keyed
  by `mem:<ulid>`: a re-run scans the committed log and **skips** every ULID already present, so a
  second full run writes zero new lines (no-op) and exits clean ("already migrated"). The `meta`
  marker is written **last**, after all entries are flushed. Therefore a crash mid-migration (dirty
  half-migrated state) leaves the marker unset → the next cold path re-runs, sees the already-emitted
  ULIDs (skips them, no duplicates — union-merge-safe because appends are id-unique) and completes the
  remainder. Net: **id-keyed skip = idempotent; marker-last = resumable.**
- **Secret guard on the export path (E4).** Pre-guard store memory predates E4, so the deterministic
  secret-shaped guard runs during export: a secret-shaped entry is **not** silently committed — it is
  diverted to the personal overlay as `needs-review` with a success-shaped remediation note, so
  migration cannot leak a secret into git history.
- **Reindex.** After export, the store is rebuilt from the committed files; determinism is E6
  canonical logical equality (normalized dump equal across machines), never byte-identical SQLite.

**Rejected:**
- **(2) Lazy dual-read** — leaves two sources of truth indefinitely and re-introduces the exact
  divergence B1 exists to kill; violates the clean cut.
- **(3) Manual re-author** — lossy: drops `mem:<ulid>` ids, provenance, and status history; violates
  the preservation requirement and non-destruction.

---

## S4 — Cross-branch anchor semantics (CONTRACT only; rides `flagAnchorDrift`)

**Operates under:** A5 (`target-removed`/`signature-changed` → needs-review; `body-changed` →
down-rank only), E7 (`flagAnchorDrift` corrections + file a reason-classed `stale-suspect` conflict
via `addConflict`), Decision 5 (freshness structural; resolution = committed decision fact), E1
(three-layer conflict; git = textual only; semantic filed at post-merge reindex reconcile), E2, S9
(`unresolved-here` disjoint from `stale-suspect`). Implementation rides the landed
`flagAnchorDrift` (`packages/core/src/ingest/code/incremental.ts:249-293`) — this specifies the
contract, it does not re-write the machinery.

**Contract:**

1. **Freshness is branch-local, recomputed at reindex, never committed.** A memory's committed bytes
   (log entry + anchor lines) are branch-independent. Anchor drift and the `stale-suspect` conflict
   it files are **derived index state**, a function of `(committed memory files, the checked-out code
   index)`, recomputed per checkout. Drift **never** mutates a committed file (checking out a branch
   does not dirty the memory log) — the committed *decision* log is only touched when a **human
   resolves** the surfaced conflict (Decision 5 / C4). Effective served status = the fold-status
   combined with the local drift annotation (A5).

2. **What a checkout sees.** Memory committed on branch A, anchored to symbol `S`; on branch B `S`
   diverged or was deleted:
   - On **B** (after checkout + reindex against B's code): the memory is served with the A5-classed
     drift signal — `target-removed`/`signature-changed` → effective `needs-review` + reason-classed
     `stale-suspect` conflict (E7 `addConflict`); `body-changed` → down-rank only (A5), still active.
   - On **A**: the same memory reads active, no drift.
   - Same committed bytes, different derived freshness **by construction** (E6: derived state is a
     deterministic function of committed files + current code).

3. **What a merge produces.** Merging B→A (or to main via PR): the memory log merges textually
   (`merge=union`, E2 — no change to the memory itself). The **post-merge reindex** recomputes drift
   against the merged code; if the merged tree has `S` removed/changed, the drift/`stale-suspect` now
   shows on the merged branch. A drift is a *memory-vs-code* freshness fact, not a *memory-vs-memory*
   contradiction, so it is **recomputed, not merged** — distinct from the E1 semantic-contradiction
   reconcile (which files contradictions between two memories at the same post-merge step).

4. **Interaction with `unresolved-here` (S9): a branch-absent anchor is NOT `stale-suspect`.** The
   deterministic split, implementable on the reverse `dependency_index` / generation history (the
   same machinery S10 uses):
   - **`target-removed` (drift → stale-suspect, needs-review):** the anchor target **had a prior
     `content_hash` in this index lineage** and is now gone/changed — it existed here and drifted,
     so the memory may be stale.
   - **branch-absent (→ `unresolved-here`, NOT stale):** the anchor target is **absent AND never had
     a `content_hash` in this index lineage** (a per-branch symbol, or a target that rode in via
     merge but lives on another branch). Absence-of-evidence, not evidence of staleness. Rendered
     "anchor not present on this branch/checkout"; still recallable; committed status unchanged.
   - Rule: *removed* requires having-been-here; *unresolved-here* is never-been-here-on-this-checkout.

---

## S8 — Per-carrier ownership & sync matrix (the widened core)

**Operates under:** Decision 1 (derived/authored split governs sync), Decision 3 (git = sync layer,
E1 three-layer conflict), Decision 7 / three-tier scope, C3 (concepts follow memory), E3 (host
imports → overlay), E4 (secret guard), VISION invariant 4 (server never durably mirrors an SoR).

**Categories:** **①** derived-from-committed-source (SoT = git; store = deterministic cache; never
synced; regenerated locally; `store.sqlite` gitignored). **②** authored-local (SoT = committed
`.ctx/` files; git + PR; conflicts per the E1 three-layer model). **③** external system-of-record
(SoT = the external system; ctx holds a dated local snapshot; re-imported per person, never
committed; freshness = snapshot age). Plus two non-category rows the frame requires: **overlay** =
zone 2 (gitignored, per-person, never synced) and **push target** (an output surface, not a source).

| Carrier | Content type(s) fed | Category | Zone | Sync policy | Reason |
|---|---|---|---|---|---|
| tree-sitter tier-1 | Code structure | **①** | cache | never synced; regenerated locally | derived from committed source; store = deterministic cache |
| `index.scip` (when present) | Code structure | **①** | cache | never synced; regenerated locally | derived artifact over committed source; no divergence by construction |
| local git (commits/diff/blame/rename) | Change history · Decisions (commit msgs) | **①** | cache | never synced (git *is* the shared source) | immutable derived facts; the store is a cache over git |
| ADR / design docs (local files) | Decisions | **①** | cache | never synced; regenerated locally | derived from committed repo files |
| local requirement docs | Requirements/stories | **①** | cache | never synced; regenerated locally | derived from committed repo files |
| local docs & glossaries | Domain/doc knowledge | **①** | cache | never synced; regenerated locally | derived from committed repo files |
| meeting recap **imported as a committed local file** | Decisions · Domain knowledge | **①** | cache | never synced; regenerated locally | carrier is a committed file → derived; **same content, different carrier from the Confluence row** |
| GitHub PR / issue threads | Change history · Decisions | **③** | snapshot | re-import per person (credentialed); never committed | external SoR; staleness + credential-leak risk |
| Jira (stories / issues) | Requirements/stories · Decisions | **③** | snapshot | re-import per person (credentialed); never committed | external SoR |
| Confluence (incl. **meeting recap fetched from Confluence**) | Domain/doc knowledge · Decisions | **③** | snapshot | re-import per person (credentialed); never committed | external SoR; **same recap content, ③ because the carrier is credentialed/network** |
| `remember()` durable memory | Memory/experience | **②** | committed | git + PR; E1 three-layer conflict | authored-local; SoT = committed `.ctx/memory/` |
| human notes (`remember` human-authored) | Memory/experience | **②** | committed | git + PR | human-authored → satisfies E3 directly; committed |
| concepts (glossary/definition entities) | Domain/doc knowledge | **②** | committed | git + PR | C3: concepts follow memory out of index-not-copy into committed `.ctx/concepts/` |
| host auto-memory dirs (Claude / Codex / Copilot `memories/`) | Memory/experience | **overlay → ② on confirm** | overlay (zone 2) | imports land per-person in the overlay as `needs-review`; **confirmation** produces a committed ② event | E3: committed = human-authored **or human-confirmed**; auto-generated notes never enter git unreviewed (closes echo loop + privacy hole) |
| `.ctx/push.jsonc` (push pin/veto) | — (project presentation) | **②** | committed | git-synced shared config (D27/D30) | three-tier (b): project presentation is shared, committed |
| personal overlay files (`.ctx/*.local.*`) | my-view attention · unconfirmed imports · session/task memory | **overlay** | zone 2 | gitignored; **never synced** | three-tier (c) personal attention + E3 import landing; deliberately divergent |
| host instruction files (AGENTS.md / CLAUDE.md) | — | **push TARGET, not a source** | — | ctx *writes* a managed block; **excluded from ingest** (echo prevention) | it is an output surface, not a content source; ingesting it would re-import ctx's own push (echo) |
| `store.sqlite` / `ledgers.sqlite` | — (the index itself) | **① by construction** | cache | gitignored; rebuildable | not a carrier; the derived index — commit sources, gitignore the index (src/ vs dist/) |

**Driver (why the matrix is carrier-keyed):** a meeting recap **imported as a committed local file is
①/② → git-synced**; the **same recap fetched from Confluence is ③ → per-person snapshot, never
committed**. Same content, different carrier, different policy.

---

## S9 — External sync + `unresolved-here`

**Operates under:** S9 ruling text (sync prompt), VISION invariant 4, E3, Decision 5, Decision 7
(push eligibility needs fresh anchors), and the S4 disjointness rule above.

- **State name: `unresolved-here`** — a **derived, per-machine / per-branch annotation**, not a
  committed status and not a conflict that implies staleness. It marks a *committed* memory (②) whose
  anchor points at an entity that is **not resolvable in the current context**: a category-③ target
  (Jira story / PR) whose snapshot has not been imported on this machine, or a per-branch symbol
  absent on this checkout (S4).
- **Rendering:** external case — `"anchor unresolved on this machine — run \`ctx import <carrier>\`"`;
  branch-absent case — `"anchor not present on this branch/checkout"`. Same state, context-appropriate
  hint.
- **Disjoint from `stale-suspect` (the keeping-apart rule):** `stale-suspect` requires the target to
  have **existed in this index lineage and then changed/been-removed** (a positive drift signal with a
  recorded prior `content_hash`). `unresolved-here` is the **absence** of any prior resolution here
  (no `content_hash` in this lineage) — absence-of-evidence, not evidence of staleness. An
  `unresolved-here` memory is therefore **never** down-ranked as stale and **never** flipped to
  `needs-review` by drift; its committed fold-status is unchanged; it stays recallable with the import
  hint. It becomes `stale-suspect` only if, after import/checkout, the now-resolvable target shows
  drift.
- **Push (Decision 7):** on a machine where an anchor is `unresolved-here`, freshness cannot be
  verified, so the memory is **locally** excluded from the ≤1KB push digest (conservative — push
  requires fresh anchors). This is a local eligibility exclusion, never a global status change.
- **Import cadence surfacing without network at write/serve:** import is an explicit cold-path action
  (`ctx import <carrier>`); no network is touched at write or serve. Surfacing reads **local snapshot
  metadata only** (dates): `ctx doctor` and the guide Knowledge page show snapshot age + last-import
  time (alongside the E8 `needs-review` queue), and a served memory with an `unresolved-here` anchor
  renders the import hint inline. Cadence is advisory ("snapshot N days old; run `ctx import`"), never
  an auto-fetch.

---

## S10 — Performance & incrementality budget

**Operates under:** A11 (dirty < 20 ms, serve < 150 ms — must not regress), E6 (canonical logical
equality), the M1 first-call catch-up gate (D25 refresh-trigger model). Mechanics ride the reverse
`dependency_index` and the generation/cursor machinery already in the schema.

1. **Memory dirty-check = mtime-first + manifest short-circuit.** Store a manifest in `meta`/`cursors`
   = `{ .ctx/memory tree mtime, entry count, aggregate hash }`. Dirty-check compares the directory
   mtime to the stored value: **unchanged tree → one `stat` (< 1 ms), no file reads.** On a
   dir-mtime advance: `stat` each file, checksum **only** files whose own mtime advanced
   (mtime-first, checksum-on-change). Unchanged `.ctx/memory/` ≈ one stat ≪ 20 ms.
2. **Anchor re-verification is change-set-bounded.** On code reindex, the reverse `dependency_index`
   (indexed by changed symbol id) yields exactly the anchored memories touching the changed set — an
   indexed lookup keyed by the changed-symbol set, **never** a scan over all memory. Cost =
   `O(changed anchors)`, not `O(all memory)`. Asserted at scale (N memories, k changed → k re-checks).
3. **Reindex on `git pull` is pulled-delta-proportional.** The append-only log + a byte-offset /
   last-ULID cursor let reindex replay only the appended/changed entries (and their detail sidecars)
   from the pulled `git diff`, not the whole `.ctx/memory/`. Cost ∝ pulled lines.
4. **Status fold is cached in the index, never replayed per query.** The derived status (E2/E5 fold
   over the decision log) is materialized in the rebuildable index's `memory.status` column; queries
   read the column (single indexed read). The fold runs once at ingest of new decision events, and
   only for memories whose decision log gained events (change-set-bounded, same as #2). The log is
   the source; the index is the fast read.
5. **Dirty-check cadence = inherit the M1 first-call catch-up gate.** A per-process first-call gate
   (the D25 refresh-trigger model), **not** per-query and **not** a filesystem watcher. The first
   query in a process runs the mtime dirty-check + catch-up within the refresh budget; subsequent
   queries in the same process serve the published generation with **zero re-parse**. A clean refresh
   serves the cached generation (E6 canonical) with zero re-parse.

**A11 not regressed:** dirty is dominated by ~one stat on an unchanged tree (< 20 ms); serve is
single indexed reads with no log replay and no full scan (< 150 ms), on a large `.ctx/memory/`
fixture.
