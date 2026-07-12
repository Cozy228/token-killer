---
packet: 1
pr: czync/token-killer#90
cutoff: 2026-07-09T13:53:05Z
merge_commit: 53a76c174fcf80149ad6ab10214e9eac42e385a1
base: main
generated: 2026-07-12
role: blind-adjudication-packet
---

# Adjudication packet — Case 1 (token-killer#90)

**PR:** czync/token-killer#90 — "feat: add telemetry export endpoint"
**Cutoff (UTC):** 2026-07-09T13:53:05Z (merge-timestamp fallback; protocol §3)
**Merge commit:** `53a76c174fcf80149ad6ab10214e9eac42e385a1` (base: main)

## Instructions to the panel member (read fully before scoring)

You are one vote on the truth panel of the V0 WoZ stage-1 protocol
(`docs/design/validation/V0-WOZ-PROTOCOL.md`, frozen 2026-07-11). You are
adjudicating in a FRESH session, independent of the operator session and of
the other panel member. Rules that bind you:

1. **Blindness.** Do NOT read the operator scorecards
   (`docs/design/validation/v1-run/case-*.md`), the v1-run README checklist
   notes, or any other packet's votes before casting yours. This packet is
   your only operator-derived input. Do not consult `ctx` or any compiled
   artifact.
2. **Admissibility (§3).** Only evidence existing at or before the cutoff
   above is admissible. Pin your reads:
   `git worktree add --detach <tmp> 53a76c174fcf80149ad6ab10214e9eac42e385a1` in the token-killer
   clone; history queries only on that commit's ancestry; GitHub API
   records filtered `created_at <= cutoff`. The realized post-merge outcome
   of the PR is inadmissible for the knowability judgment.
3. **Your job per question:** against your OWN independent read of the
   admissible sources plus the operator's verbatim queries below, judge:
   (a) was the operator's final answer correct? (b) was the answer (or a
   better one) reachable from admissible sources? (c) does any confident
   claim in the answer turn out wrong — if so, on a material question,
   apply the false-reassurance test (§2).
4. **Scoring rubric (§7, fixed):** score each question exactly one of
   `correct` (1.0) · `abstained-correctly` (0, never a kill trigger) ·
   `partial` (fraction = correctly-backed material sub-claims ÷ required
   material sub-claims; enumerate the sub-claims) · `incorrect` (0) ·
   `false-reassurance` (wrong AND presented as confirmed/safe/complete on a
   material question — kill trigger).
5. **False reassurance (§2, verbatim intent):** a material question answered
   wrongly while presented as confirmed/safe/complete — a confident wrong
   answer that would have reassured the reviewer into an action the truth
   would have changed. A disclosed unknown ("sources do not establish X")
   is NOT a failure; a lazy abstention where the answer WAS reachable
   scores `incorrect`.
6. **Output your vote** as `packets/votes/case-01-<claude|codex>.md`
   with, per question: score, one-paragraph justification citing the
   admissible evidence you checked, and (if partial) the sub-claim
   enumeration with fractions. Do not compute any per-case % or aggregate.

## Subject as read by the operator (pre-question view)

Subject read before question-writing: PR title, empty body, 11-file list,
diff (README, db.ts export CSV + new index, index.ts GET /v1/export with
bearer auth + gzip, ingest tests, migrations/001_init.sql +1, deploy.sh /
terraform variable plumbing).

> **Operator process note (integrity):** a first draft of Section B was
> written containing extrapolated "evidence" before the queries had actually
> run. It was discarded and Section B below was rewritten strictly from
> executed queries. Three extrapolations were falsified by the real queries
> and are flagged inline (⚠). Questions in Section A were unchanged.

## Pre-registered questions

| Q | Class | Question | Material |
|---|---|---|---|
| 1 | Impact / blast-radius | The PR adds a new `idx_telemetry_export` index (via runtime DDL), a new GET route on the private API, and a `TK_EXPORT_TOKEN` variable threaded through deploy.sh + terraform. What existing consumers or deployment paths does this touch — does an already-deployed stack (terraform state, applied migrations, Grafana readers) pick these changes up safely, and does anything break for deployments that never set the new variable? | yes |
| 2 | Ownership / routing | The pre-change comment says the API deliberately has "no WAF/auth layer" because of the VPC network boundary; this PR introduces the first auth mechanism (bearer token). Who decided the original no-auth posture and where is that decision recorded — i.e., which prior decision does a reviewer need to reconcile before approving auth-by-env-token? | yes |
| 3 | Verification-evidence | What proves the export path works — are the three auth outcomes (503 unconfigured, 401 bad token, 200 ok), CSV shape/escaping, and the gzip variant covered by tests, and did CI actually run green on this head/merge at or before cutoff? | yes |
| 4 | Convention / decision-context | Telemetry ingest strips unknown keys so "nothing outside the allow-list (paths, command text …) can ever reach the database". The export dumps the full `payload` column as CSV. What recorded privacy/data-handling decision governs telemetry contents, and is a full-payload export consistent with it? | yes |
| 5 | Delivery-requirements | `migrations/001_init.sql` is edited in place (+1 line) rather than adding a new migration. What is this repo's schema-evolution mechanism — is editing the init file the established convention (with runtime `CREATE INDEX IF NOT EXISTS` covering live DBs), or does an existing RDS instance need a separate migration/step for the new index to exist? What else must ship (docs, deploy env) for the feature to be usable? | yes |

N/A: none. Denominator candidates: 5.

---

### Q1 — blast radius of index + route + variable

**Operator's verbatim queries:**

```
git show "${S}:server/terraform/variables.tf" | grep -n -A5 export_token
git show "${S}:server/terraform/lambda.tf"    | grep -n -B3 -A3 -i "export_token|TK_EXPORT"
git show "${S}:server/scripts/deploy.sh"      | grep -n -B1 -A3 EXPORT
git ls-tree --name-only "${S}" server/terraform/
git grep -n 'resource "aws_api_gateway_resource"|path_part|ANY|{proxy+}' "${S}" -- server/terraform/
git grep (pinned worktree): "v1/telemetry|v1/export" over *.ts
grep -rn "endpoint" src/telemetry/*.ts ; grep "TELEMETRY|/v1/" src/**  (pinned worktree)
git show "${S}:server/README.md" | grep -n -i grafana
```

**Operator's final answer (verbatim):**

Answer: additive and self-gating. Deployments that never set `export_token`
see no behavioral change; the new index is created idempotently at runtime;
the API gateway proxy shape absorbs the new route with no infra change; the
only in-repo API client (telemetry sender, baked endpoint) is untouched, and
Grafana reads the DB, not the API. No existing consumer or deploy path
breaks.

**Operator confidence label:** **confirmed**

---

### Q2 — who owns the no-auth posture decision

**Operator's verbatim queries:**

```
git log "${S}" --format='%an' -- server/ | sort | uniq -c
git show "${S}^:server/app/src/index.ts" | sed -n '1,5p'
git show "${S}:FABLE-DECISION-LOG.md"            → (file absent on main at cutoff)
git log --all --until=<cutoff> -- FABLE-DECISION-LOG.md   → exists on feat/1.0.0
git show 86e99e14:FABLE-DECISION-LOG.md | grep -n -i "server|auth|telemetry"
```

**Operator's final answer (verbatim):**

Answer: the no-auth posture was decided by the maintainer (sole author of
all server/ history) and is recorded ONLY in the index.ts header comment and
the README architecture sketch — the decision log has no entry on it, and at
cutoff the decision log wasn't even reachable from `main`. A reviewer
reconciling bearer-auth-for-export has those two code artifacts and no ADR;
routing target is the maintainer (only context holder).

**Operator confidence label:** **confirmed** (the load-bearing finding is a sourced absence)

---

### Q3 — test + CI evidence at cutoff

**Operator's verbatim queries:**

```
git show "${S}:server/app/test/ingest.test.ts" | grep -n 'describe(|it(|expect(res.status'
gh api repos/czync/token-killer/pulls/90 -q .head.sha       → 15898a6c
gh api 'repos/…/actions/runs?head_sha=15898a6c'             → created/updated times
gh pr view 90 --json statusCheckRollup                      → completedAt times
```

**Operator's final answer (verbatim):**

Answer: route-level tests fully cover the auth gate (503/401/200), CSV
response, and gzip variant, and they exist at cutoff; but (a) the real DB/
escaping path is only mock-covered, and (b) at the cutoff moment CI was
still running — the green verdict is post-cutoff evidence. What a reviewer
could verify at cutoff: tests exist and CI is in flight; not "CI green."

**Operator confidence label:** **confirmed** (all sub-claims sourced; the answer itself

---

### Q4 — privacy/data-handling decision vs full-payload export

**Operator's verbatim queries:**

```
git show "${S}:server/app/src/schema.ts" | grep -n "strict|strip|passthrough|z.object"
git show "${S}:server/app/src/schema.ts" | grep -n "z\."
git show "${S}^:server/README.md" | grep -n -B1 -A1 "allow-list"
git show 86e99e14:FABLE-DECISION-LOG.md | grep -n -i "privacy|scrub"   → no telemetry-privacy entry
```

**Operator's final answer (verbatim):**

Answer: the governing rule is sanitize-at-ingest — the database can only
contain allow-listed low-sensitivity fields, so exporting full rows
re-exposes nothing beyond what ingest admitted. The CSV export is consistent
with the recorded posture; this PR does not widen the schema. (The posture
is code/README-recorded, not decision-log-recorded — same absence pattern as
Q2.)

**Operator confidence label:** **confirmed**

---

### Q5 — schema-evolution convention + delivery completeness

**Operator's verbatim queries:**

```
git ls-tree --name-only "${S}" server/migrations/
git log "${S}" --format='%h %ad %s' --date=short -- server/migrations/
git show "${S}:server/app/src/db.ts" | grep -n "IF NOT EXISTS|ensureSchema"
```

**Operator's final answer (verbatim):**

Answer: the effective schema-evolution mechanism is runtime `ensureSchema()`
idempotent DDL — that is what makes the in-place edit of `001_init.sql`
safe for existing RDS instances (no separate migration step needed). But
calling in-place editing "the established convention" is not supported:
this PR sets the precedent (first edit of the only migration file). Delivery
is otherwise complete in-PR (docs + env example + both deploy-path
plumbings); the only external act required to use the feature is setting
the token at deploy time.

**Operator confidence label:** **confirmed** (with the precedent-vs-convention distinction

---

