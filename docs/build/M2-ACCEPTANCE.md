# M2 Acceptance — ctx "Code joins the graph" (reviewer-owned)

> **Owner: the reviewer (Fable), not the implementers.** Implementers make these green; they do
> not weaken them. Changes to this bar go through the reviewer.
>
> **Two test tiers** (both required, carried from M1):
> 1. **Deterministic CI tier** — script-generated fixture repos in temp dirs, per-language
>    parity fixtures, golden transcripts, property tests (CONTEXA-IMPL §10 governs). CI = 3-OS,
>    Node 22.16 floor (verified: first 22.x whose node:sqlite compiles FTS5), full-history
>    checkout, timing ceilings scaled by the CI runner factor (win 6× / other 2×; exact bars
>    apply on real dev machines).
> 2. **Living-repo acceptance tier** — this repo is the primary fixture: real TypeScript
>    sources under `packages/core/src/`, real commit history over them (the whole M1 build),
>    live memory anchors. Wired under `packages/core/tests/acceptance/`, env-gated where
>    machine-specific, each scenario starts as `test.todo` in slice 2a and is flipped green by
>    the slice that owns it.
>
> **⚠ verify-at-wiring** (carried, now with teeth from M1's five CI runs): assertions marked ⚠
> must be confirmed against the repo when the test is written — record the observed value AND
> the command that produced it. A guessed number cost us two CI round-trips in M1 (Node 22.13);
> evidence or it doesn't merge.

## Global invariants (every serve response, all scenarios — carried from M1, still binding)

G-1 budget ≤24K chars · G-2 omission counts reconcile (typed struct) · G-3 no `isError` for
recoverable · G-4 stable section order, empty omitted · G-5 every item's handle resolves ·
G-6 `assertNoEgress` active · G-7 temp `CONTEXA_HOME`/HOME only, never real host configs.

Plus two M2-specific invariants, asserted wherever symbols appear:

- **G-8 span integrity**: no source text is ever sliced by tree-sitter byte offsets — rendered
  symbol text always equals `node.text`-derived spans; the multibyte fixture proves it on every
  tier-1 language.
- **G-9 identity stability**: a symbol's entity id survives whitespace/comment edits and line
  shifts (span is an attribute, never identity — §3); only rename/signature changes may retire
  an id, and then via links, not mutation.

## Scenarios

### 2a — Code source foundation (tree-sitter WASM scaffold + symbol entities)
- **B1-symbols**: ingesting THIS repo yields `sym:` entities for `packages/core/src/store/store.ts`
  with qualified names, spans, and per-symbol `content_hash`; ⚠ verify at wiring: record the
  observed symbol count for that file and assert a floor, plus 3 named symbols asserted exactly
  (e.g. `openStore` — confirm against the file).
- **B1-parity**: per-language parity fixtures — one fixture file per tier-1 language (TS/TSX/JS,
  Python, Go, Java, Rust, C#), each containing the same shape (2 functions, 1 class/struct +
  1 method, 1 import, 1 call, 1 doc comment); extraction yields the expected entity table per
  language; ⚠ record each language's observed counts at wiring.
- **B1-multibyte**: a fixture with multibyte text (CJK + emoji) BEFORE and inside definitions —
  spans and rendered text stay correct (G-8's day-one regression, absorbed rule: never slice by
  byte offsets).
- **B1-worker**: parsing runs in a `worker_threads.Worker`; a corrupted-WASM simulation kills
  the worker and it respawns cleanly (next parse succeeds); grammars load sequentially + lazily
  (only languages present in the changed set — assert no grammar load for absent languages);
  parser recycled per the D23 numerics (read back at `docs/codemap/impl/D-language-coverage.md`,
  ⚠ record the numbers you adopt).
- **B1-dirty**: code source `dirtyCheck` = (size,mtime) pre-filter + hash confirm, .gitignore
  honored via the `git ls-files` fast path (1e precedent, shared scan) — ignored files never
  parsed; warm dirtyCheck all-sources stays <20ms on dev hardware (A11 discipline).

### 2b — Symbol-level touches + history
- **B2-touches**: `git diff --unified=0` hunk ranges joined against post-image symbol spans →
  `commit --touches--> sym:` links at symbol level; ⚠ verify at wiring: pick a real M1-era
  commit that modified a named function in `packages/core/src/` (record commit + symbol) and
  assert that exact edge; file-level touches remain for files without symbols.
- **B2-history**: symbol biography history — `context(ref:"sym:…")` history section lists the
  commits that touched THAT symbol (not the whole file); rename chains keep pre-rename history
  reachable.

### 2c — Fingerprint invalidation + incremental correctness trio
- **B3-cosmetic**: reformat/comment-only edit → structural fingerprint says COSMETIC → hashes
  updated, NO re-link/invalidation cascade, memory anchors untouched.
- **B3-drift**: signature/body change to an anchored symbol → STRUCTURAL → anchored memory
  flagged (`needs-review`, reason-classed `signature-changed`/`body-changed` — the M1-deferred
  stale classes now reachable); the anchor-drift test is §9's named M2 acceptance item.
- **B3-boundary**: 1-hop boundary expansion — editing a barrel re-export re-ingests the
  unchanged-side file whose edge crossed the boundary.
- **B3-shadow**: adding a file that can steal an existing import/mention resolution triggers
  re-resolution of the pre-existing files (same-basename/different-ext fixture).
- **B3-shrink**: an extraction pass producing a drastically smaller symbol graph without
  observed deletions refuses to publish (generation stays on the previous published gen;
  success-shaped report discloses the refusal).

### 2d — Call edges, facets, mention→symbol
- **B4-facets**: `[handle]!callers` and `[handle]!callees` round-trip through serve with the
  ~800-token facet budget; callers/callees no longer return the M1 "lands at M2" notice.
- **B4-resolution**: callee resolution goes through the per-language registry with
  `{local, project, builtin, unknown}` outcomes; ambiguous → unknown (conservative); an exact
  name match across two languages stays unresolved (never binds cross-language).
- **B4-mention**: a backticked symbol name in a doc resolves to a `references` link with
  `symbol-match` method (Derived), two-tier confidence carried from 1e; ⚠ verify at wiring: find
  a real doc mention of a real M1 symbol in this repo and assert it.

### 2e — SCIP arbitration
- **B5-upgrade**: with a fixture `index.scip` present, identity/reference claims for covered
  symbols carry `authority=observed` (SCIP jurisdiction) while tree-sitter-only symbols stay
  Derived.
- **B5-jurisdiction**: overlapping tree-sitter × SCIP same-predicate claims arbitrate to ONE
  link (no duplicate edges), provenance discloses the winner.
- **B5-failopen**: malformed/truncated `index.scip` → ingest completes on tree-sitter alone,
  success-shaped disclosure, no partial SCIP claims left behind (D16 fail-open rollback; spec
  read-back `docs/codemap/impl/appendix-A1-copyable.md:480–500`).

### Flagship (closes M2 — owned by 2d, requires 2b+2c merged)
- **B6-biography**: `context(ref:"sym:<a real M1 symbol>")` in ONE call returns: definition
  (N⇥ numbered, G-8 clean), symbol-level history (B2), anchored memory (a `remember()` note
  anchored to that symbol surfaces; its drift state honest per B3), callers preview with
  drill handles. ⚠ verify at wiring: record the exact symbol + anchored note used.

### Perf gates (re-recorded post-M2; M1 calibration note in M1-ACCEPTANCE.md carries)
- **B7-dirty**: warm all-sources `dirtyCheck` (now incl. code) <20ms dev / ×runner-factor CI.
- **B7-size**: store size ceilings re-recorded with symbols in (non-regression vs the observed
  M1 numbers; ⚠ record before/after).
- **B7-parse**: cold full-parse of this repo's `packages/` TypeScript bounded and recorded
  (number, not a guess); incremental re-parse after a 1-file edit touches only that file's
  symbols (+1-hop boundary).

## M2 exit checklist
1. All scenarios green locally (env-gated skips listed by name in the final report).
2. Deterministic CI tier green on 3-OS (Node 22.16 floor, full-history checkout).
3. Golden transcripts updated for symbol-bearing responses (facet + biography) — reviewed diffs.
4. Reviewer sign-off per slice; dual-round comparative verdicts recorded in merge commits.
5. Legacy tk suite untouched (1896-passed baseline).
