# Goal: Ship the SHIM delivery tier (command-compression, host-agnostic)

Drive agent sessions that give Token Guard a **deterministic, host-agnostic way to put the
[Command proxy](../CONTEXT.md#surfaces) in front of real tools** — a PATH shim — for the
hosts where GitHub Copilot hooks do not fire (the user's VS Code env). The compression
logic (`src/handlers/**`, `src/core/**`) is **done and unchanged**; this is a thin
delivery + executor-correctness layer in front of it.

- **Decision source of truth:** `docs/adr/0002-shim-delivery-tier-and-passthrough.md`
- **Vocabulary source of truth:** `CONTEXT.md` → *Delivery* section (Delivery tier, Shim,
  Instruction injection, Passthrough, Specific match, Interactive command)
- **Why hooks aren't the path:** `docs/layer2-hook-protocol-spike.md` (closed — do not
  relitigate)
- **Reuse as-is:** `src/cli.ts`, `src/router.ts`, `src/handlers/**`, `src/core/**`,
  `recordRawPassthrough` (cli.ts). Do NOT re-implement compression.

## Guardrails (non-negotiable)

- **User-level scope only** (CONTEXT.md *User-level*; DESIGN §15). All shim files, PATH
  edits, and `TG_SHIM_DIR` live under `~/.token-guard/` and host user-config
  (`terminal.integrated.env`, shell RC). **Never** write into the project repo.
- **Fail toward the real tool.** Any shim/executor error → run the real tool unfiltered
  (passthrough), never crash, never block the command. Mirrors the proxy's fail-open.
- **No evidence-capping** (ADR 0001 still binds). Passthrough is lossless by definition;
  compression keeps using the existing over-budget ladder.
- **Compression only on a [specific match](../CONTEXT.md#delivery) AND non-TTY stdout.**
  A generic fall-through or a TTY (human watching) or an interactive command → passthrough.

## Scope

**Building:** the executor-correctness core (passthrough + recursion guard + match
signal + interactivity gate), the `tg shim` installer/wrappers, and the unified `tg init`
auto-detect installer with an instruction-injection fallback.

**Not building:** the hook tier installer (`tg hook …`, Track B) — out of scope here;
Phase 3 leaves a documented seam for it and wires shim + injection only. No new
compression handlers. No Windows PTY/interactive capture (interactive → passthrough).
Injection writes **user-level by default**; the only project-repo write is the opt-in
`tg init --project`.

---

## Phase 1 — Executor correctness core (ships standalone; the irreducible part)

After this phase, `tg <tool>` is shim-safe even with a manually-prepended shim dir:
interactive commands pass through with a real TTY, recursion is impossible, and only
specific matches on non-TTY stdout compress. **Independently mergeable and the only phase
that must land for the shim to be safe at all.**

1. **Specific-match signal (P1).** `src/router.ts`: keep returning a handler, but expose
   whether it was a real match. Add `export function routeSpecific(command):
   CommandHandler | null` that returns the first matching handler **excluding**
   `genericHandler`, else `null`. Keep `routeCommand` for the existing `--raw`/report
   paths. `cli.ts` uses `routeSpecific` to decide compress-vs-passthrough.

2. **Passthrough executor (P3).** `src/executor.ts`: add
   `export function executePassthrough(command, opts): Promise<number>` that
   `spawn(program, args, { stdio: "inherit", env: childEnv, cwd, shell: false })` and
   resolves the exit code only (no capture). ENOENT → 127. This is distinct from `--raw`
   (which still captures-then-prints via `executeCommand`).

3. **Recursion guard (D2).** New `src/shim/path.ts`:
   - `stripShimDir(pathVar: string, shimDir: string): string` — remove every PATH entry
     equal to `shimDir` (path-normalized, OS-correct separator).
   - `resolveReal(program, strippedPath): string | null` — walk `strippedPath` for the
     executable (respect `PATHEXT` on Windows).
   - `executeCommand` **and** `executePassthrough` build `childEnv.PATH =
     stripShimDir(process.env.PATH, process.env.TG_SHIM_DIR)` whenever `TG_SHIM_DIR` is
     set. **Sentinel:** if `resolveReal(program, stripped)` lands inside `TG_SHIM_DIR`
     (or is null while the shim-dir copy exists), throw `ShimRecursionError` → caller
     falls back to printing a clear error, never fork-bombs.

4. **Interactivity gate (P2).** New `src/shim/interactive.ts`:
   - `isInteractive(command: ParsedCommand): boolean` — explicit denylist: `git commit`
     **without** `-m`/`-F`/`--message`/`--file`; `git rebase -i`/`--interactive`;
     `git add -p`/`-i`/`--patch`/`--interactive`; any program ending in `login`
     (`gh auth login`, `npm login`, `docker login`, `aws … login`); `git mergetool`,
     `git difftool` without `--no-prompt`. Keep the list small and commented; it is a
     safety net on top of the TTY gate, not the primary mechanism.
   - The gate in `cli.ts`: **compress iff** `routeSpecific(cmd) !== null`
     **AND** `!process.stdout.isTTY` **AND** `!isInteractive(cmd)`. Otherwise
     `executePassthrough`.

5. **Wire `cli.ts` main().** Replace the current `routeCommand → execute → pipeline` block
   with: resolve `handler = routeSpecific(cmd)`; if the gate says compress → existing
   pipeline path; else → `return executePassthrough(cmd)`. `--raw` keeps its current
   capture-then-print behavior unchanged.

**Phase 1 tests** (`tests/unit/shim/`):
- `path.test.ts`: `stripShimDir` removes only exact shim-dir entries, leaves order;
  `resolveReal` finds the real tool past the shim; sentinel throws when only the shim copy
  is reachable.
- `interactive.test.ts`: `git commit` (no -m) → true; `git commit -m x` → false;
  `git rebase -i` → true; `git rebase --onto …` → false; `npm login` → true;
  `npm test` → false; `git add -p` → true; `git add .` → false.
- `gate.test.ts` (integration via a fake TTY): specific match + non-TTY → compresses;
  specific match + TTY → passthrough; generic command → passthrough; interactive →
  passthrough regardless of TTY.
- `failopen.test.ts` (the fail-open contract): when `executeCommand`/`resolveReal` throws
  `ShimRecursionError` (or any executor error), `cli.ts` must **fall back to passthrough
  of the real tool** (or, if that is also impossible, print a clear one-line error to
  stderr) and **never crash** — assert the process resolves with the real tool's exit code
  (or a deterministic non-128-signal code), not an unhandled rejection. This is the
  load-bearing "fail toward the real tool" guardrail.
- Recursion e2e: build a temp shim dir with a `git` wrapper, set `TG_SHIM_DIR`, run
  `tg git status`, assert it resolves the real git (no recursion, finite).

---

## Phase 2 — `tg shim` installer + wrappers (ships the shim tier)

Independently mergeable on top of Phase 1: gives a working shim via an explicit
`tg shim install`, no `tg init` needed yet.

1. **Subcommand dispatch.** `src/cli.ts` / `src/parse.ts`: intercept reserved
   subcommands **before** treating argv[0] as a program. Add `mode: "shim"` (and later
   `"init"`) to `ParseMode`; when `argv[0] === "shim"`, route to `src/shim/cli.ts`
   (`install` | `uninstall` | `status`), never to the command router.

2. **Shimmable-program declaration.** Add an optional `programs?: string[]` to
   `CommandHandler` (`src/types.ts`) — the **real executables** a handler fronts. Declare
   it only on handlers that wrap an external tool; leave it off tg-native verbs
   (`read`, `smart`, `summary`, `err`, `test`, `deps`, `json`, `log`, `pipe`). The wrapper
   set = `dedupe(handlers.flatMap(h => h.programs ?? []))`. Initial expected set:
   `git, gh, glab, gt, ls, tree, cat, head, tail, grep, rg, find, diff, wc, env, npm,
   npx, pnpm, yarn, jest, vitest, eslint, tsc, next, prisma, prettier, playwright,
   pytest, ruff, mypy, pip, mvn, gradle, javac, curl, aws, psql, wget, docker, kubectl,
   terraform, dotnet`. (Exact set is whatever the handlers declare — the list above is the
   acceptance target for the declaration sweep, not a parallel hardcoded list.)

3. **Wrapper generation.** `tg shim install`:
   - Create `~/.token-guard/shim/` (this dir's path is `TG_SHIM_DIR`).
   - For each shimmable program, write an executable wrapper. POSIX: a file `git`
     containing `#!/usr/bin/env sh` + `exec tg git "$@"` (chmod +x). Windows: `git.cmd`
     containing `@tg git %*` (and a PowerShell `.ps1` if needed). The wrapper calls `tg`
     by the resolved absolute path of the current `tg` binary (avoid relying on `tg`
     being on PATH inside the shimmed shell).
   - Write a manifest `~/.token-guard/shim/manifest.json` (version, dir, program list,
     install timestamp passed in — `Date.now()` is fine in app code, only workflow scripts
     forbid it).

4. **PATH injection (D1), per host.**
   - **VS Code:** patch user `settings.json`
     `terminal.integrated.env.{osx,linux,windows}` to **prepend** `TG_SHIM_DIR` to `PATH`
     and set `TG_SHIM_DIR`. Use `terminal.integrated.env`, **not** shell RC — non-interactive
     `run_in_terminal` shells skip RC (lesson from the hook round). Locate settings.json
     per-OS (`~/Library/Application Support/Code/User/`, `~/.config/Code/User/`,
     `%APPDATA%\Code\User\`).
   - **Copilot CLI / plain terminal:** append a guarded block to the shell RC
     (`~/.zshrc` / `~/.bashrc`) / PowerShell `$PROFILE` that prepends `TG_SHIM_DIR` and
     exports `TG_SHIM_DIR`. Idempotent (delimited by `# >>> token-guard shim >>>` markers).

5. **`tg shim status` + interception probe.** Report: shim dir, whether it's first on
   PATH, which host configs were patched, manifest version. **Crucially**, run an
   interception probe: spawn a non-interactive shell the way the host would and confirm a
   shimmed call actually resolves to the wrapper (proves the load-bearing assumption — see
   *Most fragile assumption* below). Report PASS/FAIL.

6. **`tg shim uninstall`.** Remove the shim dir, the RC block (between markers), and the
   `terminal.integrated.env` keys it added. Idempotent; leaves unrelated config intact.

**Phase 2 tests:**
- Wrapper-set derivation excludes tg-native verbs, includes the expected real executables.
- Wrapper file content is correct per-OS; is executable (POSIX).
- `settings.json` patch is idempotent (run twice = one block) and prepends (order matters).
- RC block is delimited and removable; uninstall restores byte-identical pre-state.
- Manifest round-trips.

---

## Phase 3 — Unified `tg init` (auto-detect ladder) + injection fallback

Independently mergeable on top of Phase 2.

1. **`tg init [--host auto|copilot-cli|vscode] [--global] [--auto-patch] [--show]`** —
   surface modeled on `rtk init`. `--show` = print current tier/status (delegates to
   `shim status` + injection check). `--auto-patch` = non-interactive.
2. **Host auto-detect** (`src/shim/detect.ts`): VS Code if `$TERM_PROGRAM === "vscode"`
   or `code` resolves on PATH or VS Code user dir exists; Copilot CLI if `~/.copilot/`
   exists. Pick the **highest available tier** (ADR 0002 §1): Copilot CLI → hook seam
   (see below); VS Code → shim (Phase 2); neither / shim probe FAIL → injection.
3. **Hook-tier seam.** If a `tg hook install` (Track B) exists, call it for the hook tier;
   if not, log "hook tier not built — using shim" and proceed. **No hard dependency on
   Track B** (keeps this phase mergeable).
4. **Instruction injection (lowest tier).** Generate an instruction file telling the model
   to prefix commands with `tg`. **Default target is user-level** (keeps the "never write
   the project repo" guardrail intact): write to the host's user-level instruction
   location — Copilot CLI → `~/.copilot/` instructions, VS Code → the user-profile
   instruction file under the VS Code user dir; fall back to `~/.token-guard/` + a printed
   note if the host has no user-level slot. **Project-level is explicit opt-in**: only with
   `tg init --project` does it append `.github/copilot-instructions.md` into the repo
   (idempotent, delimited block). Restart prompt after install (like rtk).

**Phase 3 tests:**
- Detection picks the right tier per simulated env (env vars + fake dirs).
- `--show` reports the active tier; injection file is idempotent; missing hook installer
  degrades to shim without error.

---

## Architecture (data flow, one cycle)

```
agent types `git status`
        │  (shim dir first on PATH → wrapper)
        ▼
~/.token-guard/shim/git   →   exec tg git status
        │
        ▼
  tg cli main()
        │ routeSpecific("git status") → gitStatusHandler (specific match)
        │ gate: stdout !isTTY ✓  &&  !isInteractive ✓  → COMPRESS
        ▼
  executeCommand(env.PATH = stripShimDir(PATH, TG_SHIM_DIR))   ← real git, no recursion
        ▼
  pipeline → compressed status   (≤ budget, ADR 0001 ladder)

agent types `git commit`  → wrapper → tg → routeSpecific=git-commit, but isInteractive ✓
        → executePassthrough(stdio: inherit)  → real editor opens, tg invisible
```

No cycles: the only loop risk is shim→tg→shim, cut by `stripShimDir` + sentinel.

## Verification commands

- `pnpm test` (unit) and `pnpm test:migration` stay green (no handler behavior changed).
- New: `pnpm vitest run tests/unit/shim` for Phases 1–3.
- Manual acceptance (Phase 2, in real VS Code): `tg shim install` → restart terminal →
  in an agent `run_in_terminal` shell run `command -v git` (must point into
  `~/.token-guard/shim`) and `git status` (must return compressed output) and
  `git commit` (must open the editor, i.e. passthrough). `tg shim status` probe = PASS.

## Rollback

- Phase 1: pure code; revert the commit. No external state.
- Phase 2/3: `tg shim uninstall` removes all PATH edits and the shim dir; injection file
  is removed by reverting the marked block. No data migration, fully reversible.

## Most fragile assumption (premise collapse)

**This plan assumes VS Code's `terminal.integrated.env` PATH prepend is honored by the
NON-interactive `run_in_terminal` shells the agent uses.** If it is not (same failure
class as the dead hook: the agent's tool-shell ignores the injected PATH), the shim tier
never intercepts and is dead in the user's env — leaving only instruction injection.

Deformation already built in: **Phase 2 step 5 makes `tg shim status` run an interception
probe**, and **Phase 3 detection falls to injection when the probe FAILs**. So the ladder
degrades gracefully instead of silently shipping a no-op shim. This assumption must be
confirmed by the probe on the user's real VS Code before relying on the shim tier — but
confirming it is part of the deliverable (the probe), not a prerequisite spike.

## Open dependency on a separate track

- **Hook tier installer (Track B `tg hook`)** is referenced only as an optional seam in
  Phase 3. If/when Track B ships, `tg init` should prefer it on Copilot CLI. Owner:
  whoever lands Track B; this plan does not block on it.
```
