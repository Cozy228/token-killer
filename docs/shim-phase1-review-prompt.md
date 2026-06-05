# Review prompt: SHIM delivery tier — Phase 1, with REAL host execution

You are reviewing the **executor-correctness core** of Token Killer's shim delivery tier
(`shim-delivery-goal.md` Phase 1). This is the layer that lets `tk <tool>` sit transparently
in front of real tools via a PATH shim, for hosts where Copilot hooks never fire.

**Your review is not done until you have actually run the shim in front of real tools, in the
three real hosts on this machine (plain shell + PowerShell, VS Code, Copilot CLI), and reported
per-host whether interception actually happens.** A green unit suite is necessary but *not*
sufficient — the whole tier rests on one assumption that unit tests cannot prove (see
[§5 The load-bearing question](#5-the-load-bearing-question-the-real-point-of-this-review)).
Figure out how to drive each host for real; do not substitute a unit test or a hand-wave.

## 0. Environment (already verified on this machine — macOS / darwin)

| Thing | Value |
|-------|-------|
| Shell | `/bin/zsh` |
| PowerShell | `pwsh` → `/opt/homebrew/bin/pwsh` |
| Copilot CLI | `copilot` → `/opt/homebrew/bin/copilot`; config dir `~/.copilot/` exists |
| VS Code user settings | `~/Library/Application Support/Code/User/settings.json` (no `code` CLI on PATH) |
| `tk` binary | NOT on PATH; built artifact is `dist/cli.js` (`bin.tk` → `./dist/cli.js`) |
| Installer | **Does not exist yet** — `tk shim install` / `tk init` are Phase 2/3, unbuilt. You build the harness by hand. |

## 1. What actually shipped in Phase 1 (the review surface)

Code-complete, with unit tests under `tests/unit/shim/`:

- `src/shim/path.ts` — `stripShimDir`, `resolveReal`, `buildChildPath`, `assertNoRecursion`,
  `ShimRecursionError`. The recursion guard (ADR 0002 §4).
- `src/shim/interactive.ts` — `isInteractive(command)` denylist (git commit w/o `-m`, rebase `-i`,
  add `-p`, `*login`, mergetool/difftool).
- `src/shim/gate.ts` — `shouldCompress(command, isTTY)` = specific match **AND** non-TTY **AND**
  not interactive.
- `src/router.ts` — `routeSpecific(command)` (first non-generic match, else `null`).
- `src/executor.ts` — `executePassthrough(command)` (stdio: inherit, exit-code only) +
  `buildChildEnv` that strips `TK_SHIM_DIR` from the child PATH and calls `assertNoRecursion`.
- `src/cli.ts` `main()` — the gate is wired: `--raw` unchanged; else `routeSpecific` + gate →
  compress or `executePassthrough`; compression errors fail toward passthrough.

NOT shipped (out of scope for this review, but note the gap): `tk shim install/uninstall/status`,
the manifest, automated PATH injection, the `status` interception probe, `tk init`.

## 2. Source of truth (read before judging behavior)

- `docs/adr/0002-shim-delivery-tier-and-passthrough.md` — the decision.
- `docs/shim-delivery-goal.md` — Phase 1 spec incl. the test list and the "Most fragile
  assumption" section. **Do not relitigate** why hooks aren't the path
  (`docs/layer2-hook-protocol-spike.md`, closed).
- `CONTEXT.md` → *Delivery* — vocabulary (Delivery tier, Shim, Passthrough, Specific match,
  Interactive command).
- `docs/DESIGN.md` §1.6 (quality gate) / §1.7 (delivery policy) — compression contract the shim
  must not violate.

## 3. Static review (do this, but keep it short — the real test is §4–5)

Scrutinize, with a bias toward safety and cross-platform correctness:

1. **Recursion guard correctness** (`assertNoRecursion`, `stripShimDir`, `resolveReal`). The
   load-bearing invariant is *"tk behind the shim must never re-resolve to the wrapper."*
   Probe the edges: symlinked shim dir; `TK_SHIM_DIR` with a trailing slash vs not; shim dir
   appearing twice on PATH; a program that legitimately lives in a dir whose path is a *prefix*
   of the shim dir (the `startsWith(target + sep)` check); `PATHEXT`/case-insensitive Windows
   path; an absolute-path program (`/usr/bin/git`) bypassing resolution.
2. **Fail-toward-the-real-tool** in `cli.ts`: does *every* error path (compression throw,
   `ShimRecursionError`, executor error) end in passthrough-or-clear-error, never an unhandled
   rejection, never a block? Find the seam where this could leak.
3. **Gate purity** (`shouldCompress`): TTY injected (good for tests) — but does `cli.ts` read the
   *right* TTY (`process.stdout.isTTY`, not stdin)? What about stdout redirected to a file vs a
   pipe vs a pty?
4. **Interactive denylist** (`isInteractive`): false-negatives are the danger (an interactive
   command that compresses and hangs/eats the prompt). Check `git commit --amend` (no `-m`),
   `git commit -m` combined groups (`-am`), `gh auth login` vs `gh repo login`-style false
   positives from the broad `args.includes("login")`, `aws sso login`.
5. **Passthrough exit codes / signals** (`executePassthrough`): ENOENT→127, signal→128, code
   pass-through. Compare against shell semantics (128+signal is the shell convention — is plain
   `128` right or a bug?).

## 4. Build the harness and RUN it (no installer exists — make one by hand)

### 4a. A `tk` launcher

```sh
pnpm build                                   # refresh dist/cli.js
# absolute launcher the wrappers will call (avoids PATH-ordering confusion):
mkdir -p /tmp/tk-review/bin
printf '#!/bin/sh\nexec node %s/dist/cli.js "$@"\n' "$PWD" > /tmp/tk-review/bin/tk
chmod +x /tmp/tk-review/bin/tk
```

### 4b. A throwaway shim dir + wrappers (POSIX + pwsh)

```sh
export TK_SHIM_DIR=/tmp/tk-review/shim
mkdir -p "$TK_SHIM_DIR"
for prog in git ls grep cat node; do
  printf '#!/usr/bin/env sh\nexec /tmp/tk-review/bin/tk %s "$@"\n' "$prog" > "$TK_SHIM_DIR/$prog"
  chmod +x "$TK_SHIM_DIR/$prog"
done
```

The wrappers call `tk` by **absolute path**, exactly as the real installer is specced to
(`shim-delivery-goal.md` Phase 2 step 3) — so interception depends only on `TK_SHIM_DIR` being
first on PATH, which is the exact thing each host must prove.

### 4c. The behavior matrix to verify in EACH host

Prepend the shim dir, then confirm interception **and** the compress/passthrough decisions:

| Probe | Expectation |
|-------|-------------|
| `command -v git` (or `Get-Command git`) | resolves into `$TK_SHIM_DIR`, **not** `/usr/bin/git` |
| `git status \| cat` (non-TTY stdout, specific match) | **compressed** output |
| `git status` typed at a TTY | **passthrough** full output (human watching) |
| `git commit` (staged change, no `-m`) | **passthrough** — editor opens (stdio inherited) |
| `git commit -m x` | compresses/normal — editor does NOT open |
| a generic command with no handler (e.g. `whoami` shimmed) | passthrough, streams intact |
| `git status` (recursion check) | resolves the **real** git, finite, no fork-bomb |

For the TTY cases the reviewer agent's own shell is non-TTY; drive the TTY path with `script`/a
pty, or hand the user a one-line probe to run in a real interactive terminal and report back.

### 4d. SAFETY RAILS (read before running — real fork-bomb / hang risk)

- **Fork-bomb guard test must be sandboxed.** To prove `assertNoRecursion` actually fires,
  construct the pathological case where the *only* `git` reachable is the shim copy (point PATH
  at just `$TK_SHIM_DIR`). Run it under a hard cap so a regression cannot take the machine down:
  `( ulimit -u 200; timeout 10 /tmp/tk-review/bin/tk git status )` — expect a one-line
  `ShimRecursionError`-derived message and a non-zero exit, **not** runaway processes.
- **Editor hang:** for the `git commit` (no `-m`) passthrough test, set
  `GIT_EDITOR='sh -c "echo reviewed >> \"$1\"" --'` so the editor "opens", writes, and exits —
  proving stdio was inherited without blocking your session.
- Always run probes against the throwaway repo / `/tmp/tk-review`, never the real project tree.
- Tear down: `rm -rf /tmp/tk-review; unset TK_SHIM_DIR`.

## 5. The load-bearing question (the real point of this review)

`shim-delivery-goal.md` → *Most fragile assumption*: **the shim only delivers value if the host's
non-interactive, agent-driven tool-shell honors the prepended `TK_SHIM_DIR`.** The hook tier
already died because the agent's tool-shell ignored the injected surface. If PATH injection has the
same failure mode, the shim tier is a no-op in that host and the product must fall to instruction
injection. **Determine this empirically, per host:**

1. **Plain zsh + pwsh (baseline):** prove interception works at all (4c). pwsh on macOS: prepend
   with `$env:PATH = "$env:TK_SHIM_DIR" + [IO.Path]::PathSeparator + $env:PATH` and confirm
   `Get-Command git` lands in the shim dir. (Wrappers are POSIX `sh`; pwsh on macOS runs them — if
   not, note that a `.ps1`/`.cmd` wrapper is needed, a finding for Phase 2.)
3. **VS Code:** patch `terminal.integrated.env.osx` in the user `settings.json` to prepend
   `TK_SHIM_DIR` and set it (idempotent, back the file up first). Then the question: does a VS Code
   **`run_in_terminal`** (non-interactive, agent) shell — not just a hand-opened integrated
   terminal — actually see that PATH? You likely cannot drive the VS Code agent headlessly: do
   what you can, then hand the user a precise copy-paste probe (`command -v git; echo "$PATH"`) to
   run via Copilot Chat's `run_in_terminal` in real VS Code, and report the result. Distinguish
   interactive-terminal success from run_in_terminal success — only the latter matters.
4. **Copilot CLI:** discover its non-interactive invocation (`copilot --help`; look for a
   one-shot/`-p`/exec flag) and actually make Copilot CLI execute the probe through its own
   tool-shell with `TK_SHIM_DIR` exported. Report whether the shimmed `git` is what Copilot runs.
   If it can only be driven interactively, drive it interactively and observe.

For each host report one of: **INTERCEPTS** (shim is viable), **IGNORES PATH** (shim is dead here →
injection tier), or **INCONCLUSIVE** (say exactly what blocked you and what you'd need).

## 6. Adversarial / fail-open checks (must actually execute)

- Break `tk` (e.g. point the launcher at a non-existent file) behind the shim → the command must
  still… do what? Decide what "fail toward the real tool" *can* mean when `tk` itself is broken,
  and verify the code's actual behavior matches the guardrail claim. This is the worst case.
- Feed a command whose handler throws during compression → assert passthrough fallback, real exit
  code, no crash.
- `TK_SHIM_DIR` set but empty / nonexistent dir → no crash, sane behavior.
- Confirm **no project-repo writes** occur from any shim code path (guardrail: user-level only).

## 7. Run the existing suites

`pnpm typecheck`, `pnpm vitest run tests/unit/shim`, `pnpm test:product`, `pnpm test:migration`.
Note any test that asserts behavior the real run contradicts — real behavior wins; flag the gap.

## Deliverable

A review report with:

1. **Per-host verdict table** (zsh / pwsh / VS Code run_in_terminal / Copilot CLI):
   INTERCEPTS | IGNORES PATH | INCONCLUSIVE, with the actual command + observed output as evidence.
2. **Premise verdict:** is the shim delivery tier viable on this user's real hosts, or does it
   collapse to instruction injection (and where)? This is the headline.
3. **Bugs** found in Phase 1 code, each with a minimal repro and a file:line.
4. **Safety confirmation:** recursion guard fired in the sandboxed fork-bomb test (yes/no, with
   the captured output); fail-open held in §6.
5. **Go/no-go on Phase 2** (the installer): does anything in Phase 1 need to change before an
   installer is worth building? Any per-host wrapper-format findings (e.g. pwsh needs `.ps1`).

## Guardrails for the reviewer

- pnpm only. English in any code/test you add. Surgical — this is a review, not a rewrite; if you
  fix a bug, keep it isolated and call it out.
- Never write into the project repo from a shim path; all harness state lives in `/tmp/tk-review`
  and a backed-up copy of the VS Code user settings. Restore every host config you touch.
- Be honest about what you could not drive headlessly. "INCONCLUSIVE + exact blocker + the probe I
  handed the user" is a valid, valuable result; a fabricated "works" is not.
