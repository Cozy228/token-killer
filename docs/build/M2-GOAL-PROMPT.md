# M2 Build Goal — prompt for implementing agents (Opus subagent / Codex)

You are an implementing agent for **ctx** M2 ("code joins the graph"). You build assigned
slices to green against a reviewer-owned acceptance bar. You do not change the design; you
implement it. M1 is fully merged on `feat/1.0.0`: store spine, git/docs/memory sources,
selection engine, MCP serve, push, install/doctor — all M1 scenarios green, 3-OS CI green.

## Read first (in this order)
1. `CONTEXA-IMPL.md` — your work order: **§5.2 (code structure — your core spec)**, §3
   (identity: `sym:<repo-rel-path>#<qualified.name>[~<arity/disambig>]`; span/line = mutable
   attrs, NEVER identity), §4 (SourceAdapter + structural-fingerprint dirty classification),
   §9 M2 line, §10 testing discipline.
2. `docs/build/M2-ACCEPTANCE.md` — the acceptance bar (reviewer-owned; you make it green, you
   never weaken it; ⚠ verify-at-wiring = record observed value + the command that produced it).
3. §12 read-back map BEFORE inventing — your slices have named reference entries:
   tree-sitter-analyzer query strings (lift → our `.scm`), understand-anything
   `fingerprint.ts`/`language-registry.ts` (lift) + `tree-sitter-plugin.ts` scaffold,
   codegraph `grammars.ts`/`parse-worker.ts` (port), gitnexus `parseDiffHunks` (lift) +
   `detectChanges` range-overlap (port) + incremental trio (lift off their graph API),
   D16 SCIP consumer (`docs/codemap/impl/appendix-A1-copyable.md:480–500`),
   D23 worker numerics (`docs/codemap/impl/D-language-coverage.md`).
   Maintainer stance: reference code is REFERENCE, not gold standard — this document wins.
4. `CONTEXA-DESIGN.md` + `FABLE-DECISION-LOG.md` P27–P30 for product frame and scope guards.

## Hard guardrails (M1 set, plus what M1's build taught us)
- **Greenfield**: work only under `packages/{core,cli}` + `docs/build/`. NEVER import from
  legacy `src/`, never modify `src/`, root configs, `server/`, or shipping tk behavior.
- **P27 scope**: Contexa serves context only — no review/verification features.
- **No egress**: `assertNoEgress()` is live in serve/ingest — your code runs under it.
- **pnpm only**; **Node ≥22.16** (verified floor: first 22.x with FTS5 in node:sqlite);
  TypeScript, English code + comments; conventional commits, **subject starts lowercase**
  (commitlint rejects "MCP serve"-style subjects).
- **Erasable TS syntax only** (tsconfig enforces): no constructor parameter properties etc. —
  core runs from source under Node's native type stripping; vitest transforms hide violations,
  the built CLI does not.
- **Identity paths canonicalize via `realpathSync.native`** (Windows 8.3 short names split
  identity otherwise — use the existing `shard.ts` helper pattern, don't re-derive).
- **WASM discipline (§5.2, binding)**: `web-tree-sitter` + `tree-sitter-wasms` only — zero
  native addons, zero node-gyp; grammars load sequentially AND lazily; parsing isolated in a
  respawnable `worker_threads.Worker`; parser recycled per D23 numerics; **never slice source
  text by tree-sitter byte offsets — use `node.text`** (multibyte regression on day one);
  **callee resolution never binds across languages**.
- `.wasm`/`.scm` ship through the existing copy-assets step (1a mechanism — extend the globs
  only if a new extension appears).
- Tests: temp `CONTEXA_HOME`/HOME only; `TK_SHIM_DIR` unset; EBUSY-safe cleanup
  (`rm({recursive,force,maxRetries:5,retryDelay:100})`); explicit spawn/worker timeouts;
  timing assertions use the CI runner factor pattern from `perf-gates.test.ts` (win 6× /
  other 2×), exact bars on dev hardware; fixture repos need real git history — CI checkout is
  full-depth, keep fixtures self-contained anyway.

## Build route (M2 slices; dependency: 2a → {2b, 2c, 2d} parallel → 2e; flagship B6 closes on 2d after 2b+2c merge)

| # | Slice | Lands |
|---|---|---|
| 2a | Code source foundation | web-tree-sitter WASM scaffold (sequential/lazy load, parse worker isolation + D23 recycle), language registry, tier-1 `.scm` queries (TS/TSX/JS, Python, Go, Java, Rust, C#), symbol entities/spans/per-symbol `content_hash`, code `SourceAdapter` (id:'code') registered in the default registry, (size,mtime)+gitignore dirty scan. **Pins the symbol contract — everything downstream builds on it.** |
| 2b | Symbol-level touches | `parseDiffHunks` range-overlap join vs post-image symbol spans → symbol-level `touches`; symbol biography history; file-level fallback kept |
| 2c | Fingerprint + trio | structural fingerprint (NONE/COSMETIC/STRUCTURAL) classifying content-hash mismatches; memory-anchor invalidation (anchor-drift → needs-review with `signature-changed`/`body-changed` reason classes); incremental trio: 1-hop boundary, shadow detection, shrink guard |
| 2d | Call graph + facets + mentions | call-site extraction → `structural` claims (Derived); per-language callee-resolution registry ({local,project,builtin,unknown}); `callers`/`callees` facets live in serve (replace the M1 notice); docs mention→`symbol-match` resolution; **flagship B6-biography** |
| 2e | SCIP arbitration | `index.scip` streaming consumer (D16: position encodings, fail-open rollback); SCIP upgrades identity/references to Observed; tree-sitter×SCIP same-predicate jurisdiction arbitration |

Acceptance ownership: 2a → B1-* + G-8/G-9 helpers (wire ALL M2 scenarios as `test.todo` in 2a,
acceptance-first, exactly like M1's 1a); 2b → B2-*; 2c → B3-*; 2d → B4-* + B6; 2e → B5-*;
B7 perf gates → 2e as closer (re-record with everything merged).

## Execution model (carried from P30 — maintainer re-ratifies before launch)
- **2a single-track** (Opus subagent, branch `m2/foundation`): it pins the symbol/`.scm`/worker
  contract; competing versions would fragment 2b–2e.
- **2b/2c/2d/2e dual-track** (`m2/<slice>-opus` · `m2/<slice>-codex`, both off latest
  `feat/1.0.0`): comparative review, winner merged (grafts attributed), runner-up branch kept
  until the slice closes.
- M1's dual-track verdicts to learn from (recorded in the merge commits): spec-fidelity beats
  cleverness (1d entities, 1c dir resolution), wire-format compliance is load-bearing (1g),
  measure the expensive path honestly (1i), exercise the living fixture for real (1h).
- Codex environment facts (operational, not optional): deps are pre-installed in your worktree
  (its sandbox cannot run pnpm install); it cannot commit in linked worktrees (reviewer commits
  with `Implemented-by:`/`Committed-by:` attribution); verify with
  `./node_modules/.bin/{tsc,vitest}` directly when pnpm wrappers fail.

## Coordination (unchanged from M1)
- Own worktree, own branch off latest `feat/1.0.0`. **Independence rule (dual rounds)**: never
  read, diff against, or reference the sibling implementation. The shared contract is the
  merged foundation only.
- One slice → green → review package → next. Never start an unreviewed slice's successor
  (exception: trivial follow-up commits requested by review).
- Priorities: correctness > completeness > verifiability > token economy.
- Before requesting review: rebase onto latest `feat/1.0.0`, re-run
  `pnpm -r --filter './packages/*' typecheck && test` AND `pnpm test:product` (legacy stays
  at its 1896-passed baseline).

## Review protocol (reviewer = Fable 5, main session — unchanged)
Deliver per slice, as your final report:
1. `git log --oneline feat/1.0.0..HEAD` (or changed-file list if your environment cannot commit).
2. What landed vs the slice's route row (deviations called out, each with why).
3. Scenarios flipped (names) + full test-run output tail (ctx packages AND legacy).
4. Assumptions where spec was silent (each: assumption, where recorded).
5. ⚠ verify-at-wiring values (assertion + observed evidence + the producing command).
Review gates: comparative review on dual rounds; correctness findings fixed before merge;
merges into `feat/1.0.0` are done by the reviewer, never an implementer.
