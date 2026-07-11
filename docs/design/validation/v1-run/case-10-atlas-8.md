---
case: 10
pr: czync/atlas#8
title: "ci: verify GitHub Actions pipeline + husky (squash back into source-loop)"
cutoff: 2026-06-20T08:21:37Z
cutoff_kind: merge-fallback
merge_commit: 615db18aff9927378a0821e944146522ea87140b
base: codex/MVP-source-loop
status: operated
---

# Case 10 — atlas#8

Subject read before question-writing: PR title, body (purpose: validate new
CI on a real PR; local-green gate list; contents: ci.yml single verify job
pnpm 11.8 + Node 22 frozen-lockfile, husky pre-commit/commit-msg,
capability→availability/service rename, registry manifest schema/loader),
top-dir distribution (85 files: portal 42, docs 10, context-layer 9…).

## A. Pre-registered questions (written BEFORE any source query)

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | The bundled "capability → availability/service rename across portal + context-layer" is a vocabulary migration riding a CI PR. What does it touch at cutoff (types, routes, data manifests), and does any surface still carry the old "capability" term afterwards — creating a split-brain a later reader would trip on? | yes |
| 2 | Ownership / routing | The PR merges into `codex/MVP-source-loop`, not main. What do the repo's own records at cutoff (AGENTS.md, docs, branch naming) say about who owns that integration branch and its review protocol — who is supposed to review a bundle-the-working-tree PR like this? | yes |
| 3 | Verification-evidence | The PR's entire purpose is proving the new CI pipeline on a real PR. Did the new `verify` workflow actually run GREEN on this PR's head before the 08:21:37Z cutoff, and does the workflow's job list match the locally-claimed gate list (typecheck, lint, test, portal build, lambda build)? | yes |
| 4 | Convention / decision-context | The PR installs commit conventions (husky commit-msg commitlint-conventional; pre-commit oxfmt+oxlint via lint-staged). Is that convention recorded anywhere durable at cutoff besides the hook files, and did the branch's own history conform to conventional commits before enforcement landed? | yes |
| 5 | Delivery-requirements | For the pipeline to actually gate future work: what events/branches does ci.yml trigger on at cutoff (does it cover PRs into BOTH main and the source-loop branch?), and is `--frozen-lockfile` satisfiable (lockfile committed, pnpm version pinned consistently between workflow and package.json)? | yes |

N/A: none. Denominator candidates: 5.

## B. Operator log (verbatim queries → evidence → answer)

Pinned to merge commit `615db18a`; cutoff 2026-06-20T08:21:37Z.

### Q1 — rename completeness: any capability split-brain?

Queries executed:

```
grep -rn -i capabilit (ts/tsx/json/md, excl. node_modules) @615db18a
```

Evidence (cited):

- The purge is itself RECORDED: `CONTEXT.md:141-145` (in this PR) —
  "former `capability`; goal `goal_prompt_capability_to_service_rename.md`"
  and an explicit anti-vocabulary rule: "_Avoid_: **Capability** anywhere —
  the word is purged from live code, schema, and UI".
- Remaining hits are all legitimately different things: the MCP protocol's
  own `capabilities` field (server-card.json:14, mcp/handler.ts:61,
  mcp.test.ts:32 — protocol vocabulary, not the domain term) and vendored
  third-party skill files under `.agents/skills/` (design guidance, not
  product code).

Answer: no split-brain — the domain term is gone from live code/schema/UI,
the purge is documented in CONTEXT.md with a pointer to the rename goal
doc, and every surviving "capabilities" is the MCP protocol field or
vendored non-product content that a later reader wouldn't confuse with
the old domain concept.

Confidence: **confirmed**.

### Q2 — who owns `codex/MVP-source-loop` and its review protocol

Queries executed:

```
grep -rn -i "source-loop|source loop" AGENTS.md CLAUDE.md CONTEXT.md docs/*.md plans/*.md  → EMPTY
```

Evidence (cited):

- NO document at cutoff records the integration branch's ownership,
  purpose, or review protocol — AGENTS.md, CONTEXT.md, docs/, plans/ are
  all silent on "source-loop".
- The only signals are informal: the branch name prefix `codex/` and this
  PR body's own process description ("squash-merged back into
  `codex/MVP-source-loop` once CI is green").
- The repo is single-author (all history by the maintainer), so no
  reviewer assignment exists in any record.

Answer: unrecorded — a reviewer asking "who owns this branch and who
must approve a bundle-the-working-tree PR" finds nothing at cutoff
except the branch-name convention and the PR's self-declared process.
The sources establish the absence, and the absence IS the answer:
process authority for this branch lived in the maintainer's head at
cutoff.

Confidence: **confirmed** (sourced absence).

### Q3 — did the pipeline prove itself pre-cutoff, and does it match the claimed gates?

Queries executed:

```
gh api repos/czync/atlas/pulls/8 -q .head.sha      → ec765244
gh api 'repos/czync/atlas/actions/runs?head_sha=ec765244'
sed -n '1,60p' .github/workflows/ci.yml (@615db18a)
```

Evidence (cited):

- CI run on head `ec765244`: created 08:19:32Z, **completed SUCCESS
  08:20:49Z — 48 seconds before the 08:21:37Z merge**. Green at cutoff.
- The workflow's steps (ci.yml:38-51) are exactly the body's local gate
  list, in order: `pnpm install --frozen-lockfile` → `pnpm -r typecheck`
  → `pnpm -r lint` → `pnpm -r test` → `pnpm --filter @atlas/portal
  build` → `pnpm --filter @atlas/context-layer build:lambda`.

Answer: yes on both — the PR fulfilled its stated purpose before merge
(the new pipeline ran green on the real PR head 48s pre-cutoff), and the
CI job is a 1:1 transcription of the locally-verified gate list, so
"green in CI" means the same thing as the body's "green locally".

Confidence: **confirmed**.

### Q4 — is the commit convention recorded beyond the hooks, and did history conform?

Queries executed:

```
grep -rn -i "conventional|commitlint" AGENTS.md CONTEXT.md README.md docs/
git log --format='%s' 615db18a~1 | head -12
```

Evidence (cited):

- Durable record exists: `docs/architecture/constraints.md:117` —
  constraint **#47**: "Git commits follow Conventional Commits. Every
  commit must have a type prefix (`feat:`, `fix:`, `refactor:`, `test:`,
  `docs:`, `chore:`)." (Plus older prose in archived docs.)
- Pre-enforcement history conforms: the 12 commits preceding this PR's
  merge are all type-prefixed conventional messages (feat/docs/chore
  sampled verbatim).

Answer: the convention predates its enforcement — constraint #47 in the
architecture constraints register already required Conventional Commits,
and the branch history already complied; this PR merely mechanizes an
existing recorded rule (commitlint + husky), the healthy direction on
the prose→hook enforcement ladder.

Confidence: **confirmed**.

### Q5 — will the pipeline actually gate future work?

Queries executed:

```
sed -n '1,30p' .github/workflows/ci.yml    (triggers)
grep -n packageManager package.json ; ls pnpm-lock.yaml
```

Evidence (cited):

- Triggers (ci.yml:3-6): `push: branches [main]` + `pull_request:` with
  NO branch filter — i.e. every PR against ANY base branch (including
  `codex/MVP-source-loop`) runs the verify job; direct pushes are gated
  only on main.
- Reproducibility: `pnpm install --frozen-lockfile` with the lockfile
  committed in this PR; pnpm version comes from the `packageManager`
  field (`pnpm@11.8.0`, package.json:4) via `pnpm/action-setup@v4`
  (ci.yml comment) — single source of truth, no version skew.
- `concurrency` group with cancel-in-progress and a 20-minute job
  timeout are also present (:11-18).

Answer: yes — the trigger design gates all future PRs regardless of base
branch (which is what the source-loop workflow needs), while
direct-push laxity exists only off-main (consistent with PR-based flow).
Frozen-lockfile is satisfiable and version-pinned through one field.
The delivery is complete for the gate's stated purpose.

Confidence: **confirmed**.
