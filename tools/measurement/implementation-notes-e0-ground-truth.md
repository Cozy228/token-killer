# Implementation notes — E0 ground-truth authoring (2026-07-10)

Work order: author the E0 retrieval-benchmark ground truth for all 11 tasks
(MEASUREMENT-DESIGN-V2 §1b). Deliverables: `e0-ground-truth.jsonl` (filled) +
authoring log appended to `task-bank-review.md` + proposed per-repo floors.

## Decisions (choices the design left open)

- **Location of this deviation log.** The house rule says keep `implementation-notes.md`
  at the repo/worktree root. The repo root has none, and `tools/measurement/implementation-notes.md`
  (the harness build log) is a DIFFERENT deliverable AND was being modified by a parallel
  session on the shared `feat/1.0.0` branch during this task. To avoid clobbering that
  and to keep one register per concern, this log is written as `implementation-notes-e0-ground-truth.md`
  next to the E0 deliverable instead of the monorepo root.
- **What counts as a "NON-TEST source file".** Included: `*.ts` implementation under
  `src`/`context-layer/src`/`portal/src`, including `devMocks/*.ts` (non-test source
  touched by the fix). Excluded: `*.test.ts`, `*.md` (docs/reports), `*.env.example`
  (config), and pure data fixtures (`*.sample.html`). `devMocks` inclusion is flagged in
  the authoring log so the reviewer can prune if mock/fixture code should not count toward
  retrieval relevance.
- **Decision-entry retrievability at sha.** `expected.decisions` lists only ADRs that
  BOTH govern the area AND exist in the store at the task `sha` (verified with
  `git cat-file -e`). A decision authored after the sha is not in the frozen index, so it
  cannot be a retrieval hit and is not listed. This is why tk-install / tk-jsonc have empty
  decisions (their governing ADR-0012 postdates the 2026-06-11 shas).
- **Decisions expressed as repo-relative ADR paths** (e.g. `docs/adr/0010-...md`) rather
  than bare ids, so the relevance grader can match a returned ref uniformly against files
  and decisions.
- **Proposed floors are PROPOSED, not frozen** (reviewer freezes pre-run per §1b). Values
  and rationale in `task-bank-review.md` §"E0 ground truth authoring". No E0 run was
  performed.

## Deviations (departed from the plan)

- **New-file-created-by-fix rule applied 3×.** Per the work order, where a file was created
  by the fix and is absent at `sha`, I listed the parent module the fix wires into instead
  (and noted it in the log): `atlas-availability-page-parse` → `landingZones/index.ts`
  (parent of new `locationGeo.ts`); `atlas-discovery-list-only` → `resourceContextService.ts`
  + `services/contextService.ts` (wiring parents of new `resourceContentDiscovery.ts`);
  `tk-jsonc-settings-parse` → `config.ts`/`vscodeSettings.ts`/`hostConfig.ts` (readers of
  new `jsonc.ts`).
- **Bundle-commit scoping (2 tasks).** Two fix commits bundle multiple findings; I scoped
  `expected.files` to the files in THIS task's prompt + graded test, not the whole commit:
  `tk-powershell-brace-block-rewrite` = `rewrite.ts` only (finding #25; the commit's
  #21/#23/#26 files excluded); `tk-gain-telemetry-regressions` = `gain.ts` + `telemetry/cli.ts`
  only (the commit's third finding "P1 endpoint inert" / `endpoint.ts` is not in the
  two-regression prompt and not in the graded tests). Both noted in the authoring log.
- **Ground truth authored via a hand-written map injected by a script**
  (`scratchpad/patch-e0.mjs`), not by reading git into the file. The map values are authored
  by hand from the fix commits; the script only preserves the skeleton's verbatim query text
  while patching `expected`/`gates_note`. This is NOT auto-fill-from-git (Q17 anti-leak) — it
  is a transcription aid for the hand-authored values.

## Adjacent-found (untouched)

- Parallel session on `feat/1.0.0` is concurrently modifying
  `tools/measurement/implementation-notes.md`, `run-grid.ts`, `task-bank-draft.jsonl`, and
  added `docs/build/CODEX-GATE-B-REVIEW.md`. Not mine, not touched.
- Mid-task, the parallel session applied the E-14 fix to the bank's
  `tk-install-auto-wires-copilot` prompt (`~/.copilot/hooks/` → `~/.copilot`, matching the
  golden test). My skeleton was generated before that edit, so I re-synced all 11 query
  strings to the current bank prompt (only tk-install changed). `expected.files`
  (`src/shim/init.ts`) is unaffected. Queries verified byte-identical to the current bank.
- `atlas-discovery-cql-403-fallback` fix DELETES
  `context-layer/src/sourceContent/measure-bundle-fetch-count.debug.test.ts` — a `.debug.test.ts`
  removed by the fix; excluded from `expected.files` as a test. Noted only.
- ADR-0011 (tk support routing) is marked superseded-by ADR-0013 in HEAD, but 0013 is absent
  at the `tk-support-github-channel` sha; the store's live governing decision there is 0011.
  Not a defect — just a temporal subtlety recorded in the log.

## Open questions

- The §1b relevance metric is worded as precision (denominator = returned refs). For
  single-file-target tk tasks, precision is capped by how many refs ctx returns, so a
  recall-style read may be fairer for those. Flagged for the reviewer to freeze metric
  direction + floor together (also recorded in `task-bank-review.md`).
- `devMocks/*.ts` inclusion in `expected.files` (see Decisions) is a reviewer call; if
  pruned, atlas relevance denominators shift and the atlas floor may want re-tuning.
