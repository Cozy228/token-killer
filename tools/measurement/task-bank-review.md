# R1 task-bank draft for maintainer review

Status: draft, not final.

This file explains the handoff items in plain terms and proposes a first bank.
The machine-readable draft is `tools/measurement/task-bank-draft.jsonl`.

> **Note (2026-07-10):** the earlier sections below describe the ORIGINAL 7-task
> proposal. The live bank is 11 tasks (5 atlas + 6 tk). See the
> "Contract re-review — 2026-07-10" section at the end for the current per-task
> prompt↔grader verdict and the reconciled finalization checklist.

## What the handoff means

1. **Write `accept_cmd` from the real fix commit test delta.**
   The task prompt comes from real history, but the pass/fail check must be a
   maintainer-owned objective command. I inspected the fix commits read-only and
   drafted commands from their test deltas. For Q5 validity, you should review
   and edit/approve these before treating them as the final bank.

2. **Choose auth mode.**
   Recommendation: use `run-cell --config-mode isolated` with a token:
   `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, or `ANTHROPIC_API_KEY`.
   This gives literal A7 because the real `~/.claude` is not written. Use
   `--config-mode real` only as a fallback; it is documented, but it is a
   deviation from literal A7.

3. **Run the 60-cell grid and analyze.**
   For each final task: run A/B arms, 3 reps each, in interleaved order. Then
   concatenate row files into `runs.jsonl` and run `analyze.ts`. The result is
   the four-condition R1 gate: guardrail, median uncached delta, 90% CI, and
   total-input guardrail. The verdict decides R2 go/no-go.

## Recommended draft selection

I recommend starting with these 7 tasks, not forcing 10. They are better than
padding with broad release sweeps or duplicate commits.

| task | source | verdict | why |
|---|---:|---|---|
| `tk-powershell-brace-block-rewrite` | #8 | include | Best fit: prompt names the exact bug and the fix has a focused existing test file. |
| `tk-jsonc-settings-parse` | #11 | include | Clear user-facing JSONC parsing issue; uses pre-existing modified tests. |
| `tk-gain-telemetry-regressions` | #12 | include | Compact dogfood regressions; cheap objective tests. |
| `tk-install-auto-wires-copilot` | #10 | include | Good install/hook symptom and one focused test file. |
| `tk-support-github-channel` | #4 | include with caution | Objective tests are good; prompt was broader than the eventual slice. |
| `atlas-cache-valkey-resilience` | #2 | include with caution | Strong tests, but prompt is workflow-shaped rather than a clean bug request. |
| `tk-pricing-ai-credits` | #9 | weak include | Test is clean, but prompt-to-fix provenance is noisy. Keep only if you accept the mined linkage. |

## Excluded or reserve candidates

| candidate | decision | reason |
|---:|---|---|
| #1 `915cf6a5` | reserve | Real feature with good tests, but large ctx memory event-log work; heavier than R1 needs. |
| #3 `16b24719` | exclude | Terraform/infra replacement and workflow-shaped prompt; likely too broad and environment-sensitive. |
| #5 `bc85dd6d` | exclude | Miner marked it strong, but commit has no test files in the diff. |
| #6 `ab651c5c` | exclude | Large release/docs/runtime sweep; too many unrelated deltas for a clean task. |
| #7 `2c29337f` | duplicate | Same fix commit as #8; do not count both as independent tasks. |

## Review checklist before finalizing

- Confirm each `prompt` still fairly represents the task you want the agent to do.
- Confirm each `accept_cmd` is neither too broad nor too narrow.
- Prefer commands that run pre-existing modified test files. Avoid relying on
  newly added test files unless you deliberately want the agent to recreate tests.
- Decide whether 7 tasks is acceptable for R1. If you want 8, add candidate #1
  as a reserve; I would not force #3/#5/#6 into the bank.

---

## Contract re-review — 2026-07-10

Executes MEASUREMENT-DESIGN-V2 §1c "Prompt↔grader contract check" + §0 E-10/E-14
over all 11 live bank tasks. Method, per task: extract every OBSERVABLE claim the
prompt makes (paths, dir names, output strings, orderings, exported API shapes),
then extract the contract the golden fix test under `fix-tests/<task>/` actually
asserts (fixture setup, expected strings, exact-match expectations), and record
match/mismatch. A mismatch = an agent doing exactly what the prompt says would
fail the test (E-14 class), or the test accepts what the prompt forbids.

### Per-task verdict

| # | task | verdict | prompt↔grader contract |
|---|---|---|---|
| 1 | `atlas-discovery-multimodule` | PASS | `modules` list shape, per-module bindings in order 10/20, `Terraform module: <name>` labels, `<Service> — <module> Terraform Module` titles, description-from-first-summary — all asserted verbatim in `deriveResources.multiModule.test.ts`. |
| 2 | `atlas-discovery-cql-403-fallback` | PASS | `extraInstances`, CQL `/content/search` 403 → space-listing fallback with same identity+doc-type admission, sticky-no-retry, once-per-space reuse, PRIMARY no-fallback — all match `confluenceReferenceDiscovery.test.ts`. Prompt's `/wiki/rest/api/space/{key}/content/page` is looser-asserted by the test (`url.includes("/content/page")`); no conflict. |
| 3 | `atlas-availability-page-parse` | PASS | four legend statuses, shared `blue-star` disambiguated by emoji shortname/fallback, at-a-glance table ignored, 🌏 Regions / 🖥️ Outposts header kinds, `LABEL (sub)` columns, Landing Zones non-service, `■ Domain` section headers, id derivation (acronym-wins / strip-vendor-slugify), region↔outpost merge, `{locations,services}` contract — all asserted in `parseAvailabilityPage.test.ts`. |
| 4 | `atlas-service-presentation-metadata` | PASS | category=domain, status "active", `Terraform module` entry tool at `…/modules/<address>` (e.g. example/textract/aws), owner/support/description stay unset, availability binding by machine id (`selector.service`) not name — all in `discovery.golden.test.ts`. |
| 5 | `atlas-discovery-list-only` | PASS | list-only (empty guardrail `headings`, no network/examples/description on list record, availability stays), `createResourceContentDiscovery(deps)` at `context-layer/src/resources/resourceContentDiscovery.ts` with exact `deps` shape + `sectionsFor(record, ctx)`, `rootPageId` → `/wiki/api/v2/pages/{id}/children?limit=250` + `_links.next` cursor + skip non-`current` + 403→empty — all in the two golden tests. Most detailed prompt in the bank; aligns precisely (Fable-revised to pin the fix-invented port/API). |
| 6 | `tk-support-github-channel` | PASS | `githubRepoBase`/`buildGithubIssueUrl` exports, slug→`https://github.com/owner/repo`, GHE URL kept, trailing-`/`+`.git` trim, title `tk support report`, exactly two query params + one raw `&`, "draft a GitHub issue" line, unconfigured degrade w/ `TK_SUPPORT_GITHUB` hint + no `issues/new`, usage `tk support [email|teams|github]` — all in `send.test.ts` + `cli.test.ts`. |
| 7 | `tk-powershell-brace-block-rewrite` | PASS | Authentic finding-#25 bug report (Fable accept-as-is, Q17); prompt is truncated raw text, not a spec. The load-bearing observable — `git log { git status; git log }` must rewrite to `tk git log { git status; git log }` (inner `;` never splits the brace block) — is asserted exactly in `powershell-corpus.test.ts:179`. No contract violation. |
| 8 | `tk-pricing-ai-credits` | PASS | Opus→5, Haiku→1, Sonnet 3, `gpt-5.5`=5, `usdToCredits`/`tokensToCredits`=×100 exports — asserted in `pricing.test.ts`. `fable-5`=10 is prompted but not asserted (test neither requires nor forbids); no mismatch. |
| 9 | `tk-install-auto-wires-copilot` | **FIXED (was E-14 FAIL)** | Copilot detection dir mismatch: prompt named `~/.copilot/hooks/`, golden test detects via bare `~/.copilot` (`initCli.test.ts:124,135`). Verified against the real fix commit `e8fa9b40`: detection is `existsSync(join(home,'.copilot'))` (`src/shim/detect.ts:51`); `~/.copilot/hooks/` is the hook WRITE target (`src/hook/install.ts:72`), not the detect signal. Prompt corrected `~/.copilot/hooks/` → `~/.copilot` (minimal, single observable claim). All other observable claims — "Also wiring copilot-cli" line, forced `--host` stays single-host, uninstall removes all, claude-code detect `~/.claude/settings.json` — already matched the test. |
| 10 | `tk-jsonc-settings-parse` | PASS | JSONC-tolerant readers (comments + trailing commas OK, genuinely malformed still `parse_error` / refused by apply leaving file untouched), `patchVscodeSettings` returns `{reformatted, backupPath}`, writes `<settingsPath>.tk-backup` on reformat, preserves unrelated keys — asserted in `vscodeSettings.test.ts` + `hostConfig.test.ts`. |
| 11 | `tk-gain-telemetry-regressions` | PASS | `gain --csv --daily` buckets 30 days around real `now` (no 1969/1970), header + 30 rows = 31 lines, recorded row on today's bucket; `telemetry preview` validates config first → exit 1 with no payload printed — asserted in `gain.test.ts` + `telemetry/cli.test.ts`. |

Result: **10/11 clean, 1 fixed (E-14, task #9).** No case of "test accepts what the
prompt forbids" was found. The retracted pilot tk 0/5 pass column (E-14) was caused by
exactly this #9 mismatch — now removed.

### Edits made this pass

- `task-bank-draft.jsonl` row 9 (`tk-install-auto-wires-copilot`): prompt
  `~/.copilot/hooks/` → `~/.copilot`; `review_note` amended to record the E-14
  correction and its source-of-truth (detect.ts:51). No other prompt, no test
  fixture, and no `.ts` logic touched. The fixture copy was verified byte-identical
  to the fix commit's test (`git show e8fa9b40:tests/unit/shim/initCli.test.ts`), so
  the fixture is correct and only the prompt needed fixing.

### E-10 flag reconciliation

All 11 rows carry `prompt_reviewed:true`. After this pass that flag reflects reality:
every prompt has now had its observable claims checked against its golden test's
contract (§1c), and every prompt is Fable-touched per its `prompt_source`
(9 `fable-revised`, 1 `authored-symptom · fable-revised` ×4, 1 `session · accept-as-is`
for the authentic #25 bug report). No flag needed flipping. Only the one changed row
(#9) had its `review_note` updated; the other 10 notes remain accurate.

### Finalization checklist — reconciled

- [x] Each `prompt` fairly represents the task — verified via the per-task contract
  review above (observable claims ⇄ golden test).
- [x] Prompt↔grader contract holds for every task (§1c) — 10 clean + #9 fixed.
- [x] Each `accept_cmd` materializes the fix's FAIL_TO_PASS test (pre-existing
  modified test files, not agent-recreated) — recorded per row in the jsonl
  `review_note`s; unchanged this pass.
- [ ] Bank size ratified for R1 (now 11 tasks, not the original 7) — maintainer call,
  out of scope for this review.
- [ ] Owed prompt-authenticity reviews signed off + `draft:true` → graduated — remains
  a maintainer step (V2 §8 precondition), separate from this contract check.

---

## E0 ground truth authoring — 2026-07-10

Authored `e0-ground-truth.jsonl` (11 rows) per MEASUREMENT-DESIGN-V2 §1b. Skeleton
generated by `e0-init-ground-truth.ts`; `expected.files` / `expected.decisions` /
`gates_note` filled by hand. Anti-leak (Q17/P32): for each task I read ONLY the bank
row, that task's real fix commit in the source repo, and the decision registers
(`docs/adr/`). No ctx store, arm config, `.work` artifact, or run output was read; ctx
was not run.

**Rules applied.** `expected.files` = the fix commit's touched NON-TEST source files,
verified to exist at the task `sha` via `git cat-file -e <sha>:<path>`. Excluded from
every list: `*.test.ts` (tests), `*.md` docs/reports, `*.env.example` (config), and pure
data fixtures (`*.sample.html`). `devMocks/*.ts` are non-test source touched by the fix,
so they are INCLUDED (flagged below — reviewer may prune if mock/fixture code should not
count toward retrieval relevance). `expected.decisions` = ADR paths that govern the area
AND exist in the store at the task `sha` (a decision authored after the sha is not
retrievable, so it is not listed). Empty decisions where none clearly governs — not
padded (V2 §1b).

Per task — fix commit read, files chosen, decisions chosen, ambiguities:

- **atlas-discovery-multimodule** (fix `41e37b0`, sha `dc19c05`). Files: `deriveResources.ts`,
  `discoverSources.ts`, `composition.ts`, `devMocks/fixtures.ts` (all `context-layer/src`).
  Excluded `portal/.env.example` (config) + the test. Decision: ADR-0010
  (module-and-confluence-source-division) — governs a service's module→source mapping,
  the exact assumption the fix breaks (one→many modules). `devMocks/fixtures.ts` = mock
  seed data, kept per the include rule; reviewer may prune.
- **atlas-discovery-cql-403-fallback** (fix `eb51da7`, sha `e1ddbae`). Files:
  `confluenceReferenceDiscovery.ts` (main), `discoverGuardrails.ts`,
  `confluenceCloudContentProvider.ts`, `devMocks/handlers.ts`. Excluded the deleted
  `measure-bundle-fetch-count.debug.test.ts` + the added test. Decisions: ADR-0016
  (convention-driven-confluence-reference-discovery — the port the fix extends), ADR-0006
  (governed-honesty-model — the prompt's "PRIMARY 403 stays an honest gap / unavailable").
- **atlas-availability-page-parse** (fix `2059ccc`, sha `bfff465`). Files:
  `confluenceAvailabilityProvider.ts` (holds `parseAvailabilityPage`), `devMocks/availabilityFixture.ts`,
  `landingZones/index.ts`. Decision: ADR-0009 (availability-matrix-resolver). NEW-file note:
  `landingZones/locationGeo.ts` was CREATED by the fix (absent at sha) → not listed; the
  parent module it wires into, `landingZones/index.ts` (re-exports it), IS listed.
  `devMocks/availability.sample.html` = data fixture, excluded.
- **atlas-service-presentation-metadata** (fix `292f483`, sha `c298643`). Files:
  `deriveResources.ts`, `discoverSources.ts`. Decisions: ADR-0013
  (resource-projection-not-materialization — "project presentation fields onto the record"),
  ADR-0006 (governed-honesty — "fields that aren't discoverable must stay unset rather than
  guessed"). ADR-0014 refines 0013 (both present at sha); listed 0013 as the α decision, not
  padding with both.
- **atlas-discovery-list-only** (fix `d8f38e4`, sha `b6964dd`). Files: `discoverSources.ts`,
  `discoverGuardrails.ts`, `resources/resourceContextService.ts`, `services/contextService.ts`,
  `composition.ts`, `portal/src/api/server/mcp/tools.ts`. Excluded `portal/.env.example` +
  two golden tests + `mcp.test.ts`. Decisions: ADR-0013 (live projection / lazy content) +
  ADR-0014 (resource-read one-core-many-views — the `getResourceContext` surface the fix
  wires into). NEW-file note: `resources/resourceContentDiscovery.ts` was CREATED by the fix
  (prompt asks to add it; absent at sha) → not listed; the parents it wires into
  (`resourceContextService.ts`, `services/contextService.ts`) ARE listed.
- **tk-support-github-channel** (fix `a700dfa`, sha `e125c8e`). Files: `src/support/cli.ts`,
  `src/support/send.ts`, `src/cli.ts`. Excluded `CONTEXT.md` + tests. Decision: ADR-0011
  (support-routing-env-configured) — present at sha and named in the prompt. Note: ADR-0011
  is marked superseded in HEAD by ADR-0013 (baked-at-build), but 0013 is ABSENT at the task
  sha; 0011 is the live governing decision in the store at `e125c8e`, so it is the correct
  ground-truth decision.
- **tk-powershell-brace-block-rewrite** (fix `2c29337`, sha `f9caf6f`). Files: `src/hook/rewrite.ts`
  ONLY. AMBIGUITY: this fix commit bundles four audit findings (#21/#23/#25/#26) and touches
  install.ts/capability.ts/init.ts/preflight.ts too, but THIS task is finding #25 (the prompt
  cites `rewrite.ts:40`) and the graded test is only `powershell-corpus.test.ts` → rewrite.ts
  is the sole in-scope source file; the other four files serve the other findings and are
  excluded. Decisions: none — no ADR governs the PowerShell tokenizer correctness detail
  (ADR-0002 shim-delivery/passthrough is area-adjacent but does not govern the brace-tracking
  bug); left empty per no-padding.
- **tk-pricing-ai-credits** (fix `041ad37`, sha `0fcd6f6`). Files: `src/core/pricing.ts`.
  Decisions: none clearly governs a rate table + credits-helper addition (ADR-0004
  telemetry/gain-parity consumes pricing but does not govern the rates); left empty.
- **tk-install-auto-wires-copilot** (fix `e8fa9b4`, sha `68b584d`). Files: `src/shim/init.ts`.
  Decisions: EMPTY. The governing decision (additive multi-host wiring) was ratified LATER as
  ADR-0012 (vscode-hook-shim-additive-delivery, dated 2026-06-15) — ABSENT at the 2026-06-11
  sha, and the ADR numbering at this sha predates it. No pre-existing ADR cleanly governs
  "wire all present hosts additively", so empty (honest, not padded with an unretrievable doc).
- **tk-jsonc-settings-parse** (fix `d5e8e6f`, sha `eb43692`). Files: `src/context/vscodeSettings.ts`,
  `src/core/config.ts`, `src/shim/hostConfig.ts`, `src/shim/cli.ts`. Excluded the report `.md`
  + tests. NEW-file note: `src/core/jsonc.ts` was CREATED by the fix (absent at sha) → not
  listed; the parent readers it is wired into (`config.ts`, `vscodeSettings.ts`, `hostConfig.ts`)
  ARE listed. Decisions: EMPTY — cross-cutting JSONC parse tolerance is not governed by a single
  ADR present at sha (ADR-0012, the vscode delivery ADR, is again absent at 06-11).
- **tk-gain-telemetry-regressions** (fix `c487d07`, sha `7d431c0`). Files: `src/core/gain.ts`,
  `src/telemetry/cli.ts`. AMBIGUITY: the fix also touches `src/telemetry/endpoint.ts`, but that
  is the commit's THIRD finding ("P1 endpoint inert") and is NOT in this task's two-regression
  prompt (csv window + preview config); the graded tests are `gain.test.ts` + `telemetry/cli.test.ts`
  only → endpoint.ts excluded as out-of-prompt-scope. Decision: ADR-0004
  (opt-in-network-telemetry-and-gain-parity) — present at sha, governs both the telemetry
  preview surface and gain reporting.

### Proposed relevance floors (reviewer freezes BEFORE any E0 run)

Metric read as PRECISION: fraction of the query's returned refs that hit an
`expected.files`/`expected.decisions` entry (V2 §1b wording "fraction of returned refs
that hit..."). Proposed per-repo floors, one-line rationale each:

- **atlas — floor 0.5.** Atlas fixes touch a well-clustered 2–6 file surface inside one
  subsystem (`context-layer/src/discovery` + `sourceContent`); a competent retriever
  should land at least half its top refs on that surface.
- **token-killer — floor 0.4.** tk fixes are narrower (often 1 file: pricing/install/
  powershell), so the small expected set caps achievable precision when ctx returns a
  handful of refs; floor set lower to reflect the smaller target, not a weaker instrument.

Other gates confirmed per V2 §1b: **timeout-rate gate ≈ 0** (any hang / transport error
= product defect → route to OPEN.md O-32, fix before E1/E2); **drillability floor = 1.0**
(every advertised `[handle]` must resolve). Recorded in each row's `gates_note` as
PROPOSED — not frozen, and no benchmark was run.

OPEN QUESTION for the reviewer (freeze-time): the §1b relevance metric is worded as
precision (denominator = returned refs). For single-file-target tk tasks precision is
capped by how many refs ctx returns, so a recall-style read (did each expected file
appear in the returned refs) may be fairer for those; flagged so the floor + metric
direction are frozen together.
