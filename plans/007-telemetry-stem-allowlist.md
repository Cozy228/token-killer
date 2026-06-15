# Plan 007: Stop telemetry command stems from transmitting user content (closed subcommand vocabulary)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 0fcd6f6..HEAD -- src/telemetry/commandStem.ts tests/unit/telemetry/commandStem.test.ts src/telemetry/topCommands.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. NOTE: at planning time the working
> tree already carried uncommitted changes to `src/telemetry/build.ts` and
> `tests/unit/telemetry/build.test.ts` (unrelated in-flight work) —
> `commandStem.ts` itself was clean. Coordinate before touching anything that
> overlaps that in-flight diff.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `0fcd6f6`, 2026-06-12 (added after counter-review upgraded this from "rejected" — the original audit's "telemetry redaction holds" verdict was wrong)
- **Issue**: https://github.com/Cozy228/token-killer/issues/10

## Why this matters

The telemetry payload's `top_commands` field promises "redacted stems (program +
subcommand), no args/paths" (`src/telemetry/build.ts:47`), and `commandStem.ts`'s
header promises "Args, paths, flags, URLs, and secrets are dropped — never
emitted raw." Neither holds: for the 28 programs in `SECOND_TOKEN_PROGRAMS`, the
**second token is emitted verbatim** unless it pattern-matches `isArgToken`. For
`rg`/`grep` the second token is the **user's search pattern**; for `psql` a
database name; for `curl`/`wget` a bare host; for `aws`, a leaked credential
pasted as an argument (`aws AKIAIOSFODNN7EXAMPLE` — uppercase alnum, not hex, no
`=`, no path → passes every guard and is transmitted). Generic builds are
opt-in, but `TK_TELEMETRY_DEFAULT=true` builds opt users in by default
(`src/telemetry/defaults.ts:1-4`), so the redaction layer is the only thing
standing between user content and the network. A stem must come from a **closed
vocabulary**, never from user input.

## Current state

- `src/telemetry/commandStem.ts:43-72` — `SECOND_TOKEN_PROGRAMS`: a Set of 28
  program names including `git`, `npm`, `docker`, … and also `curl`, `wget`,
  `psql`, `rg`, `grep` (which take user content, not subcommands, in position 2).
- `src/telemetry/commandStem.ts:94-106` — the leak:

  ```ts
  if (!SECOND_TOKEN_PROGRAMS.has(program)) return program;
  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (isArgToken(token)) break;
    parts.push(token);          // <-- token emitted verbatim if no pattern matched
    ...
  }
  ```

- `src/telemetry/commandStem.ts:32-41` — `isArgToken` blocks flags, URLs,
  paths, dotted names, `~@{}`, long hex, long `=` tokens. It cannot block an
  arbitrary word (`rg password`, `grep internalProjectCodename`,
  `psql customers_prod`, `aws AKIA…`).
- Consumers: `src/telemetry/topCommands.ts:14` aggregates stems;
  `src/telemetry/build.ts:115,183` puts the top 5 into the payload.
- Existing tests: `tests/unit/telemetry/commandStem.test.ts` (the structural
  pattern to extend) — plus `topCommands`/`build` tests that may assert stem
  values.
- Consent default: `src/telemetry/defaults.ts` — generic builds opt-out;
  `TK_TELEMETRY_DEFAULT=true` builds opt-in by default.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0              |
| Typecheck | `pnpm typecheck`         | exit 0              |
| Targeted tests | `pnpm vitest run --config vitest.config.ts tests/unit/telemetry/` | all pass |
| Full suite | `pnpm test:product`     | all pass            |

## Scope

**In scope** (the only files you should modify):
- `src/telemetry/commandStem.ts`
- `tests/unit/telemetry/commandStem.test.ts`
- `tests/unit/telemetry/topCommands.test.ts` / `build.test.ts` **only if** their
  assertions depend on stems the new vocabulary changes (see the drift-check
  note about in-flight changes to build.test.ts first)

**Out of scope** (do NOT touch, even though they look related):
- `src/telemetry/build.ts` / `topCommands.ts` — the aggregation is fine; only
  the stem function leaks. (build.ts also has uncommitted in-flight changes.)
- The server (`server/`) — it validates and stores whatever arrives; the fix
  belongs client-side before transmission.
- The history store — full commands on local disk are plan 003's territory.

## Git workflow

- Branch: `advisor/007-telemetry-stem-allowlist`
- Conventional commit, e.g. `fix(telemetry): emit second token only from a closed subcommand vocabulary`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Replace the open second-token rule with a closed per-program vocabulary

In `commandStem.ts`, replace `SECOND_TOKEN_PROGRAMS` (a Set of programs whose
second token is trusted) with a map from program to its **known subcommand
set**, e.g.:

```ts
const KNOWN_SUBCOMMANDS: Record<string, ReadonlySet<string>> = {
  git: new Set(["status", "diff", "log", "show", "add", "commit", "push", "pull",
    "fetch", "branch", "checkout", "switch", "merge", "rebase", "stash", "clone",
    "remote", "tag", "reset", "restore", "blame", "grep", "rev-parse", "describe", "worktree"]),
  npm: new Set(["run", "install", "ci", "test", "exec", "ls", "list", "audit",
    "publish", "view", "init", "outdated", "update", "uninstall"]),
  // pnpm/yarn: same vocabulary as npm plus "dlx"/"why"/"workspace" …
  docker: new Set(["build", "run", "ps", "images", "compose", "exec", "logs",
    "pull", "push", "stop", "start", "rm", "rmi", "inspect", "network", "volume"]),
  // kubectl, gh, glab, cargo, go, dotnet, terraform, gcloud, aws, mvn, gradle:
  // fill from each tool's documented top-level subcommands (closed, lowercase).
  // vitest/jest/pytest/ruff/eslint/tsc: keep only their real modes
  // ("run", "watch", "check", "format", …).
};
```

Rules:
- `rg`, `grep`, `curl`, `wget`, `psql` get **no entry at all** — their second
  token is user content; the stem is just the program name.
- Emission rule: second token is appended **only if**
  `KNOWN_SUBCOMMANDS[program]?.has(token)`; anything else → program only.
  This removes the need to rely on `isArgToken` for the leak path (keep
  `isArgToken` for the program-slot guard at line 91).
- `docker compose <sub>` three-part stems: keep the existing special case but
  the third token must also pass a compose-subcommand set (`up`, `down`,
  `build`, `logs`, `ps`, `run`, `exec`, `pull`, `restart`, `stop`).
- `git` three-part stems (line 101): drop them unless the third token is in a
  tiny closed set you can justify; simplest correct behavior is two parts max
  for git. Document the choice in the commit message.
- Populate each vocabulary from the tool's documented subcommands — it is fine
  to be incomplete (an unknown-but-legitimate subcommand degrades to
  program-only, which is safe); it is NOT fine to be open.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Tests — the leak cases become regression guards

Extend `tests/unit/telemetry/commandStem.test.ts` (match its existing
describe/test style):

1. `commandStem("rg supersecretpattern src")` → `"rg"` (not the pattern).
2. `commandStem("grep password")` → `"grep"`.
3. `commandStem("psql customers_prod")` → `"psql"`.
4. `commandStem("aws AKIAIOSFODNN7EXAMPLE")` → `"aws"`.
5. `commandStem("curl internal-host")` → `"curl"`.
6. Known subcommands still work: `git diff` → `"git diff"`, `npm run` →
   `"npm run"`, `docker compose up` → `"docker compose up"`, `vitest run` →
   `"vitest run"`.
7. Unknown-but-benign subcommand degrades safely: `git frobnicate` → `"git"`.

**Verify**: `pnpm vitest run --config vitest.config.ts tests/unit/telemetry/commandStem.test.ts` → all pass, including the 7 new cases.

### Step 3: Reconcile dependent telemetry tests + full suite

**Verify**: `pnpm vitest run --config vitest.config.ts tests/unit/telemetry/` → all pass (fix only stem-value assertions that legitimately changed).
**Verify**: `pnpm test:product` → all pass.

## Test plan

Step 2's seven cases: five leak regressions (the bug), two vocabulary
happy-paths, one safe-degradation. Pattern: existing cases in
`tests/unit/telemetry/commandStem.test.ts`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0; `pnpm test:product` exits 0
- [ ] `grep -n "SECOND_TOKEN_PROGRAMS" src/telemetry/commandStem.ts` → no matches (the open set is gone)
- [ ] The five leak regression tests exist and pass
- [ ] A token not present in a program's vocabulary can never appear in a stem (code inspection: the only `parts.push` for position ≥2 is gated by a `.has(` check)
- [ ] No files outside the in-scope list are modified (`git status --short`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `commandStem.ts` no longer matches the excerpts (drift — including if the
  in-flight telemetry work touched it after planning).
- Some consumer turns out to REQUIRE open second tokens (e.g. an inspect
  analyzer reusing `commandStem` for local-only display) — report the consumer;
  splitting a local-only variant from the wire variant is a design call.
- More than a handful of `build.test.ts`/`topCommands.test.ts` assertions break
  in ways that interact with the uncommitted in-flight changes — coordinate
  rather than rebase blind.

## Maintenance notes

- Anyone adding a program to the vocabulary must add its closed subcommand set
  — reviewers should reject any return to "trust position 2 if it doesn't look
  like an arg".
- The server already stores only what arrives; after this lands, consider a
  follow-up server-side length/charset sanity cap on `top_commands` entries as
  defense in depth.
- Historical payloads sent before this fix may contain user content — if the
  telemetry DB is real and populated, a one-time scrub of `top_commands` values
  not matching any known vocabulary is worth running (operator decision).
