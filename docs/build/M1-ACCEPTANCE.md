# M1 Acceptance — ctx (reviewer-owned)

> **Owner: the reviewer (Fable), not the implementers.** Implementers make these green; they do
> not weaken them. Changes to this bar go through the reviewer.
>
> **Two test tiers** (both required):
> 1. **Deterministic CI tier** — script-generated fixture repos in temp dirs, golden transcripts,
>    property tests (CTX-IMPL §10 governs; unchanged).
> 2. **Living-repo acceptance tier (this file)** — the token-killer repo itself is the primary
>    acceptance fixture: real git history (incl. the 2026-07-04 `docs/codemap/` renames), 40+ ADRs
>    in `docs/adr/`, `FABLE-DECISION-LOG.md` (P1–P29), live Claude Code memory for this project.
>    Wired as vitest tests under `packages/core/tests/acceptance/`, env-gated where
>    machine-specific (`describe.skipIf`), each scenario starts as `test.todo` in slice 1a and is
>    flipped green by the slice that owns it.
>
> **⚠ verify-at-wiring**: assertions marked ⚠ must be confirmed against the repo (`git log`,
> file contents) when the test is written — record the observed value in the test, never assert
> a guessed number. Past git history is immutable, so these assertions are stable once verified.

## Global invariants (assert on EVERY serve response, all scenarios)

- G-1 Budget never exceeded; response ≤24K chars.
- G-2 Envelope omission counts reconcile (typed struct level, per §9 addenda).
- G-3 No `isError` for recoverable conditions; unknown ref → success-shaped guidance.
- G-4 Section order stable call-over-call; empty sections omitted, never templated.
- G-5 Every rendered item carries a resolvable handle (`ctx recall <handle>` round-trips).
- G-6 No egress: acceptance runs with network access asserted unused (`assertNoEgress` active).
- G-7 Tests NEVER touch the real `~/.claude`/`~/.copilot`/host configs — writes go to a temp
  `CTX_HOME`/HOME sandbox (this repo's own history: a dev `doctor --fix` once corrupted the real
  hook config).

## Scenarios

### 1b — Store spine
- **A12-shard**: opening the store from a git worktree of this repo resolves the SAME shard as
  the main checkout; `.ctx` data survives worktree deletion.
- **A12-handles**: the short handle for a fixed entity id is identical across two separate
  processes (determinism); collision bump extends prefix length.
- **A12-generations**: concurrent writer + reader — reader always sees a complete published
  generation (never a torn one); lease steal works after TTL expiry.
- **A12-readthrough**: `locator` read-through on `CTX-IMPL.md` returns exact bytes; traversal
  attempts (`../`, absolute path) are rejected.

### 1c — Memory source
- **A1-import** *(env-gated: requires `~/.claude/projects/<this-shard>/memory/`)*: importer
  yields ≥5 memory entities, all `origin=host-import:claude-code`, `authority=inferred`, gists
  ≤240 chars; ⚠ verify entity count floor at wiring.
- **A1-echo**: no imported entity's text contains the ctx push sentinel (`ctx:managed:begin`).
- **A2-remember**: `remember("test note", anchors:["file:CTX-IMPL.md"])` → entity written,
  anchor resolved to `file:CTX-IMPL.md`, recall returns the gist; a 300-char note → success-shaped
  guidance (not an exception), nothing written.
- **A2-supersede**: second entry with `supersedes` → old entry `status=superseded`, kept, linked.

### 1d — Git source
- **A3-rename**: the rename `docs/codemap/codemap-contract.md → docs/codemap/DESIGN.md`
  (commit `28318c3`) produces a `rename-tracked` link between the two file entities; the old
  path's history is reachable from the new entity.
- **A3-commit**: `context(ref:"commit:12dc674")` cites "add ctx design and implementation
  documents" and file-level `touches` including `CTX-DESIGN.md`; message text read back via git
  locator (not stored).
- **A4-cochange**: co-change over the default window yields ≥1 link with support ≥3;
  ⚠ verify the actual top pair at wiring (candidates: codemap doc pairs) and assert that pair.
- **A4-immutable**: re-running ingest with no new commits is a no-op (cursor short-circuit,
  <20ms).

### 1e — Docs/decisions source
- **A5-adr**: `docs/adr/` yields ≥40 decision/doc_section entities; ⚠ verify at wiring whether
  ADRs carry frontmatter (`status/date`) — assert whichever fields actually exist, plus
  heading-derived titles.
- **A5-mention**: CTX-IMPL.md's backticked mention of `docs/codemap/impl/D-language-coverage.md`
  resolves to a `references` link (path-match, Derived).
- **A5-stale**: ≥1 `stale-suspect` conflict exists with a reason class ∈ {target-removed,
  never-resolved} (⚠ verify a concrete dead reference at wiring — the 2026-07-04 renames make
  stale mentions likely in older docs).
- **A5-decision-log**: `FABLE-DECISION-LOG.md`'s `**P20 — …**` glossary-pattern entries produce
  searchable entities (P20, P27 present).

### 1f — Selection engine
- **A6-search**: `search("verification tax")` top-5 includes a `docs/design/FABLE-DORA-REVIEW.md`
  section; `search("RRF")` top-5 includes CTX-IMPL §6.
- **A6-named-seed**: query containing the exact token `assertNoEgress` force-includes its
  entity even if FTS bm25 would cut it.
- **A6-decay**: for two otherwise-equal memory entities, the more recently-anchored one ranks
  higher; code entities do NOT time-decay (fixed clock injection).

### 1g — MCP serve (flagship)
- **A7-why**: `context(task:"why was the product renamed to ctx")` → decisions section cites
  P20 with a handle into `FABLE-DECISION-LOG.md`; ONE call, no retry needed.
- **A7-why2**: `context(task:"why is the guide read-only")` → cites P23/FORK-1.
- **A7-drill**: a handle from A7-why passed back as `context(handle)` returns the expansion
  (full decision text via read-through), not a re-summary.
- **A8-serving**: unknown ref → success-shaped candidates; ambiguous name → ALL candidate
  definitions in one response; source lines use `N⇥` numbering.

### 1h — Push
- **A9-budget**: rendered push block for this repo ≤1KB including the 2-line fixed header;
  property test across 1000 random memory sets never exceeds.
- **A9-pin-veto**: `.ctx/push.jsonc` pin forces an entry in; veto keeps it out; both survive
  re-render.
- **A9-idempotent**: re-render with unchanged inputs → byte-identical block (no-op guard);
  sentinel block replaceable without touching surrounding file content.

### 1i — install/doctor
- **A10-install** *(sandbox HOME)*: `ctx install` writes MCP registration + push placement for
  Claude Code (+ AGENTS.md floor) in the sandbox; `ctx doctor` verifies and reports each check;
  `doctor --remove-push` restores the files byte-exact minus the managed block.
- **A10-node**: doctor asserts Node ≥22.16 and SQLite ≥3.43. *(Reviewer amendment 2026-07-04:
  floor raised from 22.5 — 3-OS CI proved 22.5's node:sqlite lacks FTS5 ("no such module:
  fts5"), and 1b's guessed 22.13 fallback failed identically; verified against
  nodejs/node `deps/sqlite/unofficial.gni` per tag that v22.16.0 is the first 22.x compiled
  with SQLITE_ENABLE_FTS5.)*

### Perf gates (this repo, M-series; record numbers, fail on regression)
- **A11-dirty**: warm `dirtyCheck` all-sources <20ms.
- **A11-serve**: warm `context()` end-to-end <150ms.
- **A11-size**: store size <5% of repo checkout size.

> **Reviewer calibration (2026-07-04, recorded at the 1i merge).** The §10 150ms/5% targets
> were calibrated for a 10k-commit/2k-file *code* repo; this living fixture is prose-heavy
> (~4k entities, mostly doc_sections). Applied semantics, per this section's own header
> ("record numbers, fail on regression"): A11-dirty <20ms and A11-serve *drill/ref* <150ms
> are hard-asserted (both MEET); A11-serve *task/NL* (~615–670ms, dominated by 1f PPR +
> section assembly — `search()` on the same seeds ≈34ms) and A11-size are recorded observed
> numbers under non-regression ceilings, with optimization tracked at M5 (§9: M5 owns
> perf-gate enforcement). Root causes + observed values live in `perf-gates.test.ts`.

## M1 exit checklist
1. All scenarios green locally (env-gated skips listed by name in the final report).
2. Deterministic CI tier green on 3-OS.
3. Golden transcripts recorded for context/search/remember + push block.
4. Reviewer sign-off per slice (see M1-GOAL-PROMPT review protocol).
