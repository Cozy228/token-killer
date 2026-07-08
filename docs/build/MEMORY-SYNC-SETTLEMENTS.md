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
> exactly one of three zones — ① committed Mainline log (`.contexa/`, git-synced), ② personal overlay
> (gitignored, per-person), ③ external snapshot (`~/.contexa/…/snapshots/`, dated cache of an external
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
   carries an inline pointer token (`detail:<ulid>`, plain ASCII — final grammar is slice-3-owned)
   to a separate write-once file `.contexa/memory/details/<ulid>.md` holding the multi-line body.
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
under committed `.contexa/memory/details/`.

**Integrity — dangling pointers & orphan sidecars.** The entry line and its sidecar are separate git
objects, so partial staging, a crash, or a manual conflict resolution can leave a pointer without its
detail file (dangling) or a sidecar with no referencing entry (orphan). Invariants:
- (a) **Single-commit atomicity.** The sidecar is written and staged **before-or-with** the log line,
  and the authoring commit MUST contain both the entry line and its `<ulid>.md` — cheap for
  `ctx doctor` to assert (every `detail:<ulid>` pointer resolves to a committed sidecar).
- (b) **Dangling pointer = success-shaped.** A pointer whose sidecar is missing on this checkout
  renders as `"detail missing on this checkout"` and is a `ctx doctor` integrity **warning**, never a
  crash or an `isError`.
- (c) **Orphan sidecar = inert.** A sidecar with no referencing entry is never served and **never
  deleted** (non-destruction invariant); `ctx doctor` lists it.

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
   `memory` rows, emits committed `.contexa/memory/` log entries + detail sidecars + synthesized
   decision-log events (to replay non-`active` status), then the store reverts to a pure index
   rebuilt from the files.
2. **Lazy dual-read migration** — keep the store as source of truth, migrate entries to files on
   first access.
3. **Manual re-author** — operator re-enters durable memories into the new model.

**Chosen: (1) one-shot export + reindex, id-keyed idempotent, run on first post-upgrade sync.**

Mechanics:
- **Trigger.** First post-upgrade cold path (`ctx sync` / `install` / `doctor`) detects the migration
  is due via a `meta` marker (bumped `schema_version` / `memory_migrated_at` unset) with store memory
  present and `.contexa/memory/` absent-or-partial.
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
   split must be **deterministic across peers** (E6): it may NOT depend on the *local* index history,
   because two peers at the same commit would then classify the same absent anchor differently (one
   saw the symbol on a previous checkout, one never did), a branch switch would turn a per-branch
   symbol into a false `stale-suspect`, and a fresh clone would turn a real deletion into a false
   `unresolved-here`. Ground "having-been-here" in the **git graph**, not the local index: the
   committed anchor line carries **`anchored-at: <commit-id>`** — the author's HEAD at remember-time,
   written once, part of the committed bytes. On any machine, for an **absent** target, one
   `git merge-base --is-ancestor <anchored-at> HEAD` check decides it:
   - **`anchored-at` IS an ancestor of current HEAD** → the target's lineage is in this branch's
     history → it existed here and is now gone/changed → **`target-removed` drift → stale-suspect**
     (A5 classes apply); the memory may be stale.
   - **`anchored-at` is NOT an ancestor of HEAD** → the memory rode in from a divergent branch → the
     target never lived on this line → **branch-absent → `unresolved-here`**, NOT stale. Rendered
     "anchor not present on this branch/checkout"; still recallable; committed status unchanged.
   - Rule: *removed* requires having-been-here, and "having-been-here" is answered by the git graph
     (`anchored-at` ancestry), so the same absent anchor classifies identically on every peer and on
     a fresh clone. (`signature-changed`/`body-changed` need no ancestry check — the target is still
     present; its `content_hash` differs, which is drift by definition.)

---

## S8 — Per-carrier ownership & sync matrix (the widened core)

**Operates under:** Decision 1 (derived/authored split governs sync), Decision 3 (git = sync layer,
E1 three-layer conflict), Decision 7 / three-tier scope, C3 (concepts follow memory), E3 (host
imports → overlay), E4 (secret guard), VISION invariant 4 (server never durably mirrors an SoR).

**Categories:** **①** derived-from-committed-source (SoT = git; store = deterministic cache; never
synced; regenerated locally; `store.sqlite` gitignored). **②** authored-local (SoT = committed
`.contexa/` files; git + PR; conflicts per the E1 three-layer model). **③** external system-of-record
(SoT = the external system; ctx holds a dated local snapshot; re-imported per person, never
committed; freshness = snapshot age). Plus two non-category rows the frame requires: **overlay** =
zone 2 (gitignored, per-person, never synced) and **push target** (an output surface, not a source).

**Column semantics (read before the table).** The **Sync policy** column describes the
**ctx-held representation** — the index rows / snapshot ctx materializes for that carrier — NOT the
source bytes. A category-① *source file* (an ADR, a committed-local meeting recap) still travels
between peers via git as ordinary repo content; what ctx holds *over* it (the `store.sqlite` index)
is regenerated locally and never synced. So "① — never synced" means "ctx's derived representation is
never synced," not "the file never moves."

| Carrier | Content type(s) fed | Category | Zone | Sync policy (ctx-held representation) | Reason |
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
| `remember()` **via CLI** (human-authored) | Memory/experience | **②** | committed | git + PR; E1 three-layer conflict | human at the CLI → E3 satisfied; E4 "defaults to Mainline" applies to this surface (`--local` → overlay) |
| `remember()` **via MCP** (agent-authored) | Memory/experience | **overlay → ② on confirm** | overlay (zone 2) | lands as `needs-review`; human confirmation promotes to a committed ② event | E3: agent-authored is auto-generated → never enters git unreviewed (same pipeline as host imports); ruling A4 keeps lifecycle human/CLI-only |
| human notes (`remember` human-authored) | Memory/experience | **②** | committed | git + PR | human-authored → satisfies E3 directly; committed |
| concepts (glossary/definition entities) | Domain/doc knowledge | **②** | committed | git + PR | C3: concepts follow memory out of index-not-copy into committed `.contexa/concepts/` |
| host auto-memory dirs (Claude / Codex / Copilot `memories/`) | Memory/experience | **overlay → ② on confirm** | overlay (zone 2) | imports land per-person in the overlay as `needs-review`; **confirmation** produces a committed ② event | E3: committed = human-authored **or human-confirmed**; auto-generated notes never enter git unreviewed (closes echo loop + privacy hole) |
| `.contexa/push.jsonc` (push pin/veto) | — (project presentation) | **②** | committed | git-synced shared config (D27/D30) | three-tier (b): project presentation is shared, committed |
| personal overlay files (`.contexa/*.local.*`) | my-view attention · unconfirmed imports · session/task memory | **overlay** | zone 2 | gitignored; **never synced** | three-tier (c) personal attention + E3 import landing; deliberately divergent |
| host instruction files (AGENTS.md / CLAUDE.md) | — | **push TARGET, not a source** | — | ctx *writes* a managed block; **excluded from ingest** (echo prevention) | it is an output surface, not a content source; ingesting it would re-import ctx's own push (echo) |
| `store.sqlite` / `ledgers.sqlite` | — (the index itself) | **① by construction** | cache | gitignored; rebuildable | not a carrier; the derived index — commit sources, gitignore the index (src/ vs dist/) |

**Driver (why the matrix is carrier-keyed):** a meeting recap **imported as a committed local file is
category ①** — the *file* travels between peers via git as ordinary repo content, while ctx's derived
representation of it is regenerated locally and never synced; the **same recap fetched from Confluence
is ③ → a per-person snapshot, never committed**. Same content, different carrier, different policy.

**S8a — `remember()` landing zone is decided by the caller surface (E3 + E4 + A4).** The `remember()`
row splits above because E3 (committed = human-authored **or** human-confirmed) governs it and E3
names agent `remember` as auto-generated:
- **CLI `remember()` = human-authored** → Mainline default (E4's "`remember()` defaults to Mainline"
  applies to this human surface); `--local` writes the personal overlay.
- **MCP `remember()` = agent-authored** → personal overlay as `needs-review`; human confirmation
  (CLI/git, per A4's human-only lifecycle) promotes it to a committed Mainline event — the same
  overlay→confirm pipeline as host imports (E3).
This does not weaken E3: nothing auto-generated reaches git unreviewed. The E4 secret guard runs on
both surfaces before the committed zone.

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
- **Disjoint from `stale-suspect` (the keeping-apart rule, deterministic per E6):** for an **absent**
  local (symbol/file) target the split is decided by the committed `anchored-at: <commit-id>` via
  `git merge-base --is-ancestor` (S4 §4) — ancestor of HEAD → `target-removed` drift → `stale-suspect`;
  not an ancestor → branch-absent → `unresolved-here`. For a **category-③** target the split is
  simpler still: no snapshot imported locally → `unresolved-here` (the external SoR is the authority,
  not this machine). Neither test reads the local index history, so the same absent anchor classifies
  identically on every peer and on a fresh clone. An `unresolved-here` memory is therefore **never**
  down-ranked as stale and **never** flipped to `needs-review` by drift; its committed fold-status is
  unchanged; it stays recallable with the import hint. It becomes `stale-suspect` only if, after
  import/checkout, the now-resolvable target shows drift (`content_hash` differs).
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
   = `{ .contexa/memory tree mtime, entry count, aggregate hash }`. Dirty-check compares the directory
   mtime to the stored value: **unchanged tree → one `stat` (< 1 ms), no file reads.** On a
   dir-mtime advance: `stat` each file, checksum **only** files whose own mtime advanced
   (mtime-first, checksum-on-change). Unchanged `.contexa/memory/` ≈ one stat ≪ 20 ms.
2. **Anchor re-verification is change-set-bounded.** On code reindex, the reverse `dependency_index`
   (indexed by changed symbol id) yields exactly the anchored memories touching the changed set — an
   indexed lookup keyed by the changed-symbol set, **never** a scan over all memory. Cost =
   `O(changed anchors)`, not `O(all memory)`. Asserted at scale (N memories, k changed → k re-checks).
3. **Reindex on `git pull` is pulled-delta-proportional.** Reindex processes exactly the **added
   lines** from `git diff <old-tip>..<new-tip> -- .contexa/` (and their detail sidecars), not the whole
   `.contexa/memory/`. This is delta-proportional by construction and is safe under `merge=union`, where
   a byte-offset or last-ULID cursor is NOT: a union merge can insert lines *before* any byte cursor,
   and pulled events can carry ULIDs *older* than local writes — both cursors would silently skip
   events. If the diff is any non-append shape (a rewrite, a manual conflict resolution touching
   existing lines), fall back to a **full ULID-set reconciliation scan** of `.contexa/memory/` (correct,
   rare). Cost ∝ pulled lines in the common append case.
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
single indexed reads with no log replay and no full scan (< 150 ms), on a large `.contexa/memory/`
fixture.

---

## Appendix — Slice-1 implementation notes (deviation log)

Docs-only slice. Every settlement stays strictly under the cited rulings; no ruling re-opened or
contradicted. Relocated here from the removed root `implementation-notes.md` (joint-review MAJOR 5).

**Decisions (choices the design left open):**
- **S1-residual → sidecar-file-per-detail** (ULID-named, write-once): the only layout that keeps the
  committed log strictly one-line-per-entry (C1) AND makes the multi-line body untearable under the
  E2 `merge=union` line-wise merge; plus the dangling/orphan integrity invariants (doctor-asserted).
- **S4/S9 drift-vs-`unresolved-here` split grounded in the git graph** via committed
  `anchored-at:<commit-id>` + `git merge-base --is-ancestor` — deterministic across peers and on a
  fresh clone (E6). (Replaced an earlier local-index-history rule that the joint review correctly
  flagged as non-deterministic.)
- **S8a — `remember()` landing zone by caller surface:** CLI = human-authored → Mainline (E4);
  MCP = agent-authored → overlay `needs-review` → committed on human confirm (E3 + A4). Preserves E3.
- **S3 migration runs the E4 guard on export** (pre-guard store memory not silently committed) and
  writes the `meta` marker **last** for idempotent + resumable behavior.
- **Repo `.contexa/` layout named concretely** (`.contexa/memory/*.md`, `.contexa/memory/details/`,
  `.contexa/memory/decisions.md`, `.contexa/concepts/`, `.contexa/push.jsonc`, `.contexa/*.local.*`,
  `.gitattributes merge=union`) — implementer conventions for slice 3, not rulings; slice 3 owns the
  final names.

**Deviations:**
- Commits use `--no-verify` **only if** the husky `lint-staged` hook is unavailable in the worktree
  (deps not installed; known offline gotcha). All changes are docs-only `.md` — nothing a linter
  gates. Re-checked each commit per the fix-round instruction.

**Adjacent-found (untouched):**
- `docs/reference/` is untracked at the repo root (pre-existing, out of scope) — left untouched.

**Open questions:**
- None blocking. Exact on-disk names under `.contexa/` are conventions owned by slice 3 (storage swap).
