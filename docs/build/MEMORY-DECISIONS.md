# Memory — Ratified Decisions (maintainer rulings, 2026-07-05)

> **Authority.** These are the maintainer's rulings on the open decisions surfaced by the memory
> research (`docs/design/memory-research/REPORT-canonical.md`) and the ownership/sync design
> conversation. **This file is the source of truth**; the goal prompts and design docs reference it,
> they do not restate it. Dependency structure (not execution phases): **B1 is the only gate** — it
> opens the C-group; the A-group and D-group are independent.

## Root

- **B1 — ADOPT the file-backed / git-as-sync re-architecture. ✅ yes.** Durable memory becomes committed
  `.contexa/memory/` files; the SQLite store becomes a rebuildable index; git is the sync/collaboration/
  conflict layer. **Memory (and concepts, per C3) leave the index-not-copy exception** — this is a
  ratified invariant change. *Gates: C1–C5.*

## A-group — independent (decidable/implementable on the current storage model)

| ID | Decision | Ruling | Consequence |
|---|---|---|---|
| **A1** | `superseded` in the pull path | **Down-rank + surface via the conflicts section** (NOT hidden). `retired` is hard-excluded from default pull. | `select/` gains a status-aware filter; "what we believed before" stays answerable. |
| **A2** | Can a `pin` override safety exclusions? | **No.** Pin only orders *already-eligible* items; it may not force in stale / echo / `needs-review`. Veto always wins. | `push/rank` applies `isPushEligible()` before pin ordering. |
| **A3** | Import host auto-memory dirs (Claude/Windsurf/Codex `memories/`)? | **Yes — but land as `needs-review`** (not "human-authored layers only"). | Importer covers auto-memory dirs; every imported item defaults `needs-review`; drained via the review queue. |
| **A4** | Agent lifecycle mutation over MCP? | **No — human + CLI only.** Agents `remember` (write) but cannot `confirm`/`retire`/resolve. | MCP surface stays `context`/`search`/`remember`; lifecycle verbs are CLI/git. |
| **A5** | Anchor-drift status handling | **`target-removed` & `signature-changed` → flip to `needs-review`; `body-changed` → down-rank only** (noise control). | The anchor-freshness pass is reason-class-aware in how it acts, not just how it labels. |
| **A6** | Close the `Store` enumeration seam | **Fix it** — add an enumeration method to the `Store` interface; drop `listMemories`' second SQLite connection. | Small interface addition; removes the boundary leak. |
| **A7** | `served_count` / `last_served` in ranking | **Telemetry only, never a ranking input.** | Leave the columns unwired into `select/rank` + `push/rank`; usage is measurement only. |

## C-group — gated on B1 = yes

| ID | Decision | Ruling | Note |
|---|---|---|---|
| **C1** | Memory file format | **Append-only markdown, one entry per line.** | Implementer nuance to settle: how the optional `detail` (multi-line) attaches to a one-line entry — inline pointer to a sidecar block, or a fenced continuation — without breaking the append/merge-friendliness. Record it in the sync prompt S1. |
| **C2** | Decision-log format | **Markdown (append-only).** Not JSONL. | Append-only markdown merges cleanly; each line = one decision (who / when / verdict / reason / refs). |
| **C3** | Do concepts follow memory into the file model now? | **Yes — now** (not deferred). | Concepts leave the index-not-copy exception alongside memory. |
| **C4** | Conflict resolution = committed decision fact | **Confirmed.** Old memories kept; status derived from the decision log; resolutions are themselves supersedable. | — |
| **C5** | `valid_from` / `valid_to` on the schema | **Now** (not deferred). | Bitemporal validity lands with the re-architecture; populated only from explicit args / supersede-time, never inferred. |

## D-group — doc organization

| ID | Decision | Ruling |
|---|---|---|
| **D1** | VISION ↔ ctx "naming drift" | **Non-issue, closed.** `VISION.md` is the aspirational **vision** layer; its vocabulary (DCI / Atlas / CodeGraph / CodeWiki) is intentional and is *not* a naming conflict with the shipped `ctx` product. No reconciliation needed. |
| **D2** | Home of the "project context, not assistant memory" thesis | **Elevate it in `CONTEXA-DESIGN.md §1` (the shipped-product design), where it already lives as "the moat."** Not VISION (per D1, VISION is aspiration, not competitive positioning). |
| **D3** | Canonical Decision 11 (collaboration & sync) | **Add it** to `REPORT-canonical.md` + the new committed-sync invariant. |
| **D4** | Docs navigation index | **Add one** (`docs/build/README.md`) so the memory line (research → decisions → execution plan → sync prompt) is navigable. |

## E-group — post-review rulings (2026-07-05, second round)

> A second, code-verified design review (against landed `feat/1.0.0`) surfaced gaps the A–D rulings and
> the sync prompt did not close. These are maintainer rulings. They **schedule** code work; none is
> implemented here. Where an E-item amends earlier phrasing, it says so — the underlying B/A/C ruling is
> unchanged unless stated.

| ID | Decision | Ruling | Reason / amends |
|---|---|---|---|
| **E1** | Where do memory conflicts surface? | **Three-layer conflict model.** *Textual* = git (bytes only). *Identity* = dedup at reindex (`sameAsCandidate`). *Semantic* = contradiction, filed as a conflict at **post-merge reindex reconcile**, human-resolved via the decision log. Git handles **only** the textual layer. | Amends the "conflicts surface as git merge conflicts" phrasing of the sync prompt's ratified decision 3 (B1 unchanged). Git conflicts correlate with concurrency, not contradiction — a clean merge can still hide a semantic contradiction, so git cannot be the semantic surface. |
| **E2** | Event order & merge mechanics | **Line order is non-semantic.** Total order over events = `(event timestamp, then ULID)`. The append-only log declares `.gitattributes merge=union` so concurrent appends auto-merge; the status fold is **order-independent** (reads the total order, never file line order). | Makes the append-only log (C1/C2) safe under concurrent writers without textual collisions, and makes derived status deterministic across machines. |
| **E3** | Import landing zone | **Host auto-memory imports (A3) land in the personal overlay / local index ONLY, as `needs-review`.** Human confirmation is the act that produces a committed Mainline event. New invariant: **committed = human-authored or human-confirmed.** | Closes the echo loop and the privacy hole in one rule: auto-generated assistant notes never enter shared git unreviewed. Applies the S8 carrier matrix to host memory dirs (a per-person carrier). A3 (import as needs-review) unchanged; this fixes *where* it lands. |
| **E4** | Secret guard + default write scope | **Deterministic secret-shaped guard before the committed zone** (regex classes à la codex-memory ASK_USER_PATTERNS — `sk-` keys, tokens, passwords, credentials → success-shaped refusal with guidance, never a hard error). `remember()` **defaults to Mainline** (committed); `--local` writes the personal overlay. **Per-repo opt-out** knob for repos that must not commit memory at all. Ship a documented remediation note for accidental commits. | Committing memory changes the privacy envelope (git history is forever, pushed to remotes); a deterministic write-time guard is required since there is no LLM/network to lean on. |
| **E5** | Decision-collision fold | On conflicting lifecycle decisions about the same memory (e.g. A retires X, B supersedes X on another branch — no textual conflict after merge), the **later-by-total-order decision wins for derived status** AND a **contradiction-class conflict is filed** for human review. Surface, don't silently pick. | Deterministic convergence + human visibility. Uses E2's total order. |
| **E6** | Determinism acceptance | **Canonical logical equality, not byte-identical SQLite.** A normalized dump (deterministic row ordering) compares equal across machines. | "same commit → identical `store.sqlite` bytes" is physically unachievable (page allocation, insertion order, FTS internals). |
| **E7** | 2c reconciliation (schedules code, does not implement) | `flagAnchorDrift` (`ingest/code/incremental.ts:249-293`) must be corrected: (a) **`body-changed` → down-rank only** per A5 (today it flips all three reason classes to `needs-review`, line 279); (b) drift must **also file a reason-classed `stale-suspect` conflict** (`addConflict`), not just a `stale-reason` claim (today claim-only, lines 280-289), so `conflictCandidates()`/the guide stale-list see it; (c) **verify/add `file:`-anchor `target-removed` coverage** (file deleted — unverified today). | Aligns landed code to A5 and Decision 5; makes drift visible in the conflict channel. |
| **E8** | `needs-review` ops contract | Surface **queue size + oldest-item age** in `ctx doctor` and the guide Knowledge page. Imports land in the overlay (E3) so bulk imports never flood the committed log. **No auto-expiry** — aging items stay, visibly sink. | The trust model assumes a human drains the queue; A3 bulk imports can flood it. Give operators the signal without an auto-delete that would violate non-destruction. |

## Downstream updates these rulings trigger

- **Sync prompt** (`MEMORY-SYNC-GOAL-PROMPT.md`): S1 ← C1, S2 ← C2, S6 ← C3, plus `valid_from/valid_to`
  now (C5), and A3's "import auto-memory as needs-review". These sub-decisions are now **settled** —
  the prompt should point here rather than re-open them.
- **Execution plan** (`MEMORY-EXECUTION-PLAN.md`): B1 = yes; the "open decisions" list is now resolved
  by this file.
- **Canonical** (`REPORT-canonical.md`): add Decision 11 + invariant (D3); §0 divergences D0-b/D0-c
  resolved by A1/A2.
- **CONTEXA-DESIGN.md**: §1 elevate the moat (D2); §3 memory+concepts join index-not-copy indexing
  `.contexa/memory/`, `store.sqlite` gitignored, add the S8 per-carrier matrix, `valid_from/to` in schema;
  §6 guide framing; §8 sync mechanism + three-tier scope; §9 register; new invariant.
- **Code** (later): A1/A2/A5 → select+push; A6 → Store interface; A7 → keep usage out; C1–C5 →
  file-backed storage + decision log + bitemporal columns.
- **E-group (second round)** rewrites the sync prompt's ratified decision 3 (E1 three-layer conflict
  model), adds two hard invariants (E3 committed=human-authored-or-confirmed, E4 secret guard), fixes
  the acceptance bar (E5 fold/collision, E6 logical-dump determinism), and schedules the 2c
  reconciliation (E7) + the `needs-review` ops contract (E8). The sync prompt + execution plan reference
  the E-group rather than restating it. `flagAnchorDrift` (2c) is now the seed of the anchor-freshness
  work, not unbuilt — see the sync prompt's "Current-code alignment".
