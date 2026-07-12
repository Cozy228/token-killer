---
status: active
review_after: 2026-07-26
---

# Goal prompt: O-33(b) retrieval fixes (FIX-1/2/3)

Authority: `docs/build/O33B-FIX-AND-MINI-E1-PLAN.md` (A1 findings ratified 2026-07-12).
Branch: create `o33b/retrieval-fix` off `feat/1.0.0`, work in a git worktree, commit there.
Scope: `packages/core` (+ its tests) ONLY. No measurement scripts, no CLI changes.

## FIX-1 — index exported TypeScript type aliases (R-B)

`packages/core/src/extract/code/queries/typescript.scm` captures functions, methods,
classes, interfaces, consts — but NOT `type_alias_declaration`. Consequence (verified on
frozen stores): `export type DiscoveredService = {…}` has no entity and no FTS row, so
type-name queries never reach code.

- Add the capture: `(type_alias_declaration name: (type_identifier) @name) @def.class`
  — map to the existing `class` kind exactly like `interface_declaration` (smallest
  diff; do NOT extend the `SymbolKind` vocabulary).
- The callable-ancestor filter in `extract.ts` already drops function-local type
  aliases — verify with a test, don't re-implement.
- OUT OF SCOPE: `enum_declaration` has the same gap — do not fix; note it in the
  deviation log (maintainer will rule separately).
- Tests: extractor fixture with `export type Foo = {...}` (top-level → captured) and a
  type alias inside a function body (→ dropped). Existing extractor tests stay green.

## FIX-2 — path-aware named seeding (R-A)

Verified failure chain for a query containing `rewrite.ts` / `src/hook/rewrite.ts:40`:
`tokenizeQuery` (packages/core/src/select/tokenize.ts) splits paths at `/` (WORD_RE), so
only `rewrite.ts` survives; named-seed channel (a) `entitiesByName("rewrite.ts")` misses
because file entities are named by full relative path; channel (b) exact-FTS `"rewrite.ts"`
matches 31 doc sections that MENTION the file (each force-injected at NAMED_SEED_WEIGHT
100) and zero code. Result: docs flood the seed pool, served `code` section is empty.

Required behavior (implementation freedom within these invariants):

1. **Path token extraction** (tokenize.ts): a pre-pass recognizes path-shaped fragments
   in the raw query — contains `/` or `\` (accept BOTH separators; agents run on
   Windows too), optional `:line[:col]` suffix, optional absolute prefix. Emit a
   distinctive, non-derived token carrying the normalized project-relative-suffix form
   (forward slashes, `:line` stripped). The existing word tokens still get emitted.
2. **File resolution** (seeds.ts + store): for a file-shaped token (path-shaped, or a
   basename with an extension like `rewrite.ts`), resolve to file entities by path
   suffix — exact relative path match, else `…/<basename>` match. Add a store lookup
   (e.g. `filesByPathSuffix`) with a unit test; `entitiesByName` semantics stay
   unchanged for non-file callers.
3. **Flood control**: when a file-shaped token resolves to ≥1 real file entity, seed
   those entities as named seeds AND skip channel (b) exact-FTS injection for that
   token (prose mentions stay reachable through the general bm25 pass — they must not
   each get force-injected at weight 100). If you introduce any new tunable, it lives
   in `select/constants.ts` and is added to `disclosedConstants()`.
4. Determinism: zero LLM, zero IO beyond the store; same input → same seeds.

- Tests: tokenizer emits path tokens for `src/hook/rewrite.ts:40`, `src\hook\rewrite.ts`,
  and bare `rewrite.ts`; seeds resolve a basename to the file entity in a fixture store;
  a task query naming a file yields that file (or its symbols) in the served `code`
  section via `select()`; doc-mention flood does not evict it.

## FIX-3 — O-33(a) miss-guidance text

`missUnknownRef` (packages/core/src/select/engine.ts:149) is returned for BOTH unknown
refs and zero-seed task queries; its guidance ends "…or use task mode" — circular when
the input already WAS task mode. Split the guidance: task-mode miss suggests checking
`ctx sync` freshness / different wording, never "use task mode". Unit test on both paths.

## Acceptance checklist (self-verify before returning; reviewer re-checks independently)

- [ ] `pnpm` only; all commands from repo root; node ≥ 22.16.
- [ ] New extractor test: top-level `export type` captured, function-local dropped.
- [ ] New tokenize/seeds/select tests above, all green.
- [ ] FULL existing suites green: `packages/core`, `packages/cli` (run their vitest via
      pnpm; legacy suite untouched).
- [ ] No file outside `packages/core/**` (+ tests) changed.
- [ ] `implementation-notes.md` in the worktree root documents every deviation,
      including the enum_declaration observation.
- [ ] Commits on `o33b/retrieval-fix`, conventional-commit subjects (lowercase,
      ≤100 chars), pushed to origin.

Post-merge gate (reviewer, not builder): E0 rerun on frozen sandboxes must flip ≥3 of
the 4 zero-relevance tasks to 1.0 with no regression on the 7 passing tasks.
