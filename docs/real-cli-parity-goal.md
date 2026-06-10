# Goal — Real-CLI command-construction parity (RTK → tk)

Status: **done** (this batch). Supersedes the P1 item in
`/tmp/token-killer-rtk-migration-handoff.md`. Reply Chinese; code/comments English; PNPM.

## Why this exists

The migration harness (`tests/helpers/rtkCommandHarness.ts`) only exercises
`filter(stdout)` and **bypasses `execute()`**. Half of RTK's value is
*command rewriting*: RTK forces `ls -la`, `git status --porcelain -b`,
`docker ps --format ...`, `kubectl get pods -o json`, `curl -s`, etc. tk's
`executeCommand` runs the user's RAW command, so for any RTK-rewrite case the
real CLI output isn't the shape `filter()` expects → it falls back to raw → NOT
parity. "Migration green" proves *filter* parity, not *real-CLI* parity.

The harness structurally cannot catch this. Every handler where RTK rewrites the
command needs a **pure command-construction unit test** asserting the built args.

## The reference pattern (already shipped for `ls`)

`src/handlers/system/ls.ts` exports a pure `buildLsArgs()` that forces `-la`;
`execute()` runs the rewritten command (under `LC_ALL=C` via the optional
`extraEnv` param on `executeCommand`, `src/executor.ts`); the filter still reads
the user's ORIGINAL args. The construction test lives in
`tests/unit/handlers/rtkLsBehavior.test.ts` (`buildLsArgs` describe block).

**Mirror this for every command below**: pure `buildXxxArgs(userArgs)` →
`execute()` builds the rewritten `ParsedCommand` (never mutate the original; the
filter must keep seeing the user's args) → unit test asserting the built args.

## RTK oracle (verified against `rtk/src/cmds/**`)

Command construction RTK performs (the child it actually spawns):

| tk command | RTK spawns | RTK source |
|---|---|---|
| `docker ps` | `docker ps --format "{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}"` | container.rs:64 |
| `docker ps -a` | `docker ps -a --format "{{.State}}\t{{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Image}}\t{{.Ports}}"` | container.rs:118 |
| `docker images` | `docker images --format "{{.Repository}}:{{.Tag}}\t{{.Size}}"` | container.rs:224 |
| `docker compose ps [-a]` | `docker compose ps [-a] --format "{{.Name}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"` | container.rs:676 |
| `docker compose logs [svc]` | `docker compose logs --tail 100 [svc]` | container.rs:705 |
| `docker compose build` | passthrough (no rewrite) | container.rs:727 |
| `docker logs <c>` | `docker logs --tail 100 <c>` | container.rs:315 |
| `kubectl get pods` (+aliases po/pod) | `kubectl get pods -o json <rest>` | container.rs:335 |
| `kubectl get services` (+svc/service) | `kubectl get services -o json <rest>` | container.rs:421 |
| `kubectl logs <pod>` | `kubectl logs --tail 100 <pod> <rest>` | container.rs:488 |
| `git status` (compact path) | `git status --porcelain -b` | git.rs:70 |
| `git branch` (list mode) | `git branch [-a if no list-flag] --no-color <args>` | git.rs:1334 |
| `cat <file> [rtk-flags]` | RTK `read` reads file directly; tk shells to `cat` but must pass **only file operands** (no RTK flags) | read.rs |
| `curl <args>` | `curl -s <args>` | curl_cmd.rs:20 |

Dispatch guards (must mirror so execute & filter agree):

- **kubectl get → raw passthrough** when rest contains `-o`/`--output`/`-w`/
  `--watch`/`--show-labels`/`--show-kind` or `-o…`/`--output=…`
  (`kubectl_get_requests_raw_output`, container.rs:775). Resource is the FIRST
  token after `get` (positional), rest is everything after it.
- **git status compact path** (`uses_compact_status_path`, git.rs:52): empty
  args → yes; args drawn only from `{-b,--branch,-s,--short}` with at least one
  `-b/--branch` → yes; `-sb`/`-bs` → yes; anything else (incl. bare `-s`) → no
  (run `git status <args>` raw).
- **git branch modes** (git.rs:1300): action flags (`-d -D -m -M -c -C
  --set-upstream-to[=] -u --unset-upstream --edit-description`) or positional
  arg w/o a list flag → write op (RTK prints `ok`); `--show-current` →
  passthrough raw; list-flags (`-a --all -r --remotes --list --merged
  --no-merged --contains --no-contains --format[=] --sort[=] --points-at[=]`)
  → list mode. Only list mode gets `-a`(if none)+`--no-color` and the filter.

## Per-command tasks (this batch)

1. **docker / kubectl** (`src/handlers/cloud/container.ts`) — add
   `buildDockerArgs` / `buildKubectlArgs`; `execute()` rewrites; filter dispatch
   unchanged (still reads original args; align kubectl resource detection to the
   positional rule). Unit tests in `rtkDockerBehavior` / `rtkKubectlBehavior`.
2. **cat** (`src/handlers/system/read.ts`) — `buildCatArgs` returns only file
   operands (+ stdin `-`), dropping RTK-only flags so system `cat` never sees
   `--max-lines` etc. Filter still windows from the original args. Unit test in
   `rtkReadBehavior`.
3. **git status** (`src/handlers/git/status.ts`) — `buildStatusArgs` → compact
   path runs `--porcelain -b`. Unit test in `rtkGitStatusBehavior`.
4. **git branch** (`src/handlers/git/branch.ts`) — `buildBranchArgs` (list mode
   adds `-a`/`--no-color`); filter passes through for action/show-current modes
   (matches RTK `ok`/raw). Unit test in `rtkGitBranchBehavior`.
5. **curl** (`src/handlers/cloud/curl.ts`) — `buildCurlArgs` prepends `-s`. Unit
   test in `rtkCurlBehavior`.

## Intentional divergences (do NOT "align" away — documented)

- **`tk read`** keeps its richer product semantics (levels minimal/balanced/
  aggressive, stdin `-`, multi-file, first-N window with ` | ` and NO
  `[N more lines]` marker) locked by `tests/integration/cli.test.ts`. RTK's
  `read` uses `smart_truncate` + `[N more lines]`. This is a product divergence
  (memory D1); `read` stays on `readLike.ts`. Only `cat` carries the
  RTK-faithful `read` port.
- **`curl` failure path** keeps BOTH stdout+stderr (RTK prints stderr-or-stdout)
  and **always truncates** large non-JSON bodies (RTK only truncates when
  `is_tty`; piped → full body). For an LLM consumer truncation IS the value.
  Documented in `docs/green-test-parity-audit.md`; tested in product suites, not
  the parity suite.

## Gates (run before declaring done)

- `pnpm typecheck` · `pnpm test:product` · `pnpm test:check-presence` green
- `pnpm test:migration` — no in-scope command red (pre-existing out-of-scope
  reds: cargo/go/golangci/rake/rspec/rubocop/dotnet*/ruff/npx/smart/summary/
  test/deps/err/rtkScriptParity)
- Real-app smoke (suites bypass `execute()`): `pnpm dev <cmd>` for at least
  `git status`, `git branch`, `cat --max-lines 2 <file>`, `curl` — confirm the
  rewritten command runs and compacts.
