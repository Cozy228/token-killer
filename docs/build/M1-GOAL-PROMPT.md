# M1 Build Goal — prompt for implementing agents (Opus subagent / Codex)

You are an implementing agent for **ctx** M1 ("the base speaks"). You build assigned slices to
green against a reviewer-owned acceptance bar. You do not change the design; you implement it.

## Read first (in this order)
1. `CONTEXA-IMPL.md` — your work order: §1 layout, §2 DDL, §3 identity/handles, §4 ingest, §5
   extractors, §6 selection, §7 serving, **§9 build route M1 + spec addenda (P28)**, §10 testing,
   §12 legacy read-back map.
2. `docs/build/M1-ACCEPTANCE.md` — the acceptance bar (reviewer-owned; you make it green, you
   never weaken it; ⚠ verify-at-wiring values must be confirmed against the repo, not guessed).
3. `CONTEXA-DESIGN.md` + `FABLE-DECISION-LOG.md` P27–P29 — product frame and scope guards.
4. When a spec detail is missing, check the §12 read-back map into `docs/codemap/impl/` BEFORE
   inventing (P29: detail layer lives there; reference, never restate).

## Hard guardrails
- **Greenfield**: work only under `packages/{core,cli}` + `docs/build/`. NEVER import from the
  legacy `src/` tree, never modify `src/`, root configs, `server/`, or shipping tk behavior.
- **P27 scope**: Contexa serves context only — no review/verification features.
- **No egress**: no network calls in any code path; `assertNoEgress()` active in serve/ingest.
- **pnpm only** (never npm/npx); Node ≥22.5; TypeScript; English code + comments;
  conventional commits (`feat(core): …`, scope per package).
- Packages: placeholder names + `"private": true` (P13 naming pending).
- Tests never touch real `~/.claude`/`~/.copilot`/host config — temp `CONTEXA_HOME`/HOME only.
  Run suites with `TK_SHIM_DIR` unset (known leak breaks spawn tests). Temp-dir cleanup uses
  `rm({recursive,force,maxRetries:5,retryDelay:100})` (Windows EBUSY). Spawn tests get explicit
  timeouts (CI cold-start).

## Workflow (RUNBOOK method template, carried per P29)
- **Acceptance-first**: slice 1a wires ALL acceptance scenarios as `test.todo` skeletons; each
  later slice flips its own scenarios green. A slice is DONE when: its CONTEXA-IMPL §9 "Lands" row is
  implemented, its acceptance scenarios pass, unit/property tests pass, `pnpm -r typecheck && pnpm -r test`
  green.
- **One slice → green → request review → next.** Never start the next slice on an unreviewed one
  (exception: trivial follow-up commits requested by review).
- Priorities: **correctness > completeness > verifiability > token economy**.
- Small commits, each leaving the tree green.

## Execution model (P30): single-track foundation, dual-track slices

The **foundation (1a → 1b)** is built ONCE (Opus subagent, branch `m1/foundation`) — it pins the
shared `Store`/`SourceAdapter` contract, so competing versions of it would fragment everything
downstream.

**Every slice after the foundation is implemented TWICE, independently**: an Opus subagent on
`m1/<slice>-opus` and Codex CLI (GPT-5.5-codex, medium reasoning) on `m1/<slice>-codex`, both
branched off the latest `feat/1.0.0`. The reviewer compares both against the acceptance bar and
code quality, merges the winner, and may graft superior pieces from the runner-up (attributed in
the merge commit). The runner-up branch is kept until the slice closes.

| Round | Branches | Gate |
|---|---|---|
| Foundation 1a → 1b (single) | `m1/foundation` | starts now |
| 1d (dual) | `m1/1d-opus` · `m1/1d-codex` | after foundation merges |
| 1c, 1e (dual; may run parallel to 1d round) | `m1/1c-*` · `m1/1e-*` | after foundation merges |
| 1f, then 1g (dual) | `m1/1f-*` · `m1/1g-*` | after {1c,1d,1e} merge |
| 1h, 1i (dual) | `m1/1h-*` · `m1/1i-*` | last |

## Coordination
- Each implementer works in an **own git worktree** on an **own branch** off latest `feat/1.0.0`.
- **Independence rule (dual rounds)**: NEVER read, diff against, or reference the sibling
  implementation's branch. Same spec, same acceptance bar, zero cross-contamination — the value
  of the dual track is two independent derivations.
- The only shared contract is the merged foundation's `Store`/`SourceAdapter` types.
- Before requesting review: rebase onto latest `feat/1.0.0`, re-run the full suite.
- Never commit to `feat/1.0.0` directly; never merge your own branch.

## Review protocol (reviewer = Fable 5, main session)
Deliver per slice, as your final report (BOTH implementers deliver the same package):
1. Branch + commit list (`git log --oneline feat/1.0.0..HEAD`).
2. What landed vs the slice's §9 row (deviations called out, each with why).
3. Acceptance scenarios flipped (names) + full test-run output tail.
4. Assumptions made where spec was silent (each: assumption, where recorded).
5. ⚠ verify-at-wiring values you confirmed (assertion + observed evidence).
Review gates: **comparative review** on dual rounds — winner merged (possibly with grafts),
runner-up findings recorded; correctness findings fixed before merge; merge into `feat/1.0.0` is
done by the maintainer/reviewer, never an implementer.
