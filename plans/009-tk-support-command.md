# Plan 009: Add `tk support` — contact the maintainer with auto-attached error + logs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4073499..HEAD -- src/cli.ts src/parse.ts src/types.ts src/hook/debug.ts src/shim/cli.ts src/debug/collect.ts src/debug/render.ts src/report/open.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MEDIUM (new lazy-loaded subcommand is isolated; the only edits to
  shared/fail-open code are additive one-line hint calls — see Scope)
- **Depends on**: none
- **Category**: feature (diagnostics / support UX)
- **Planned at**: commit `4073499`, 2026-06-13 (direct user request)
- **Issue**: — (no tracker issue; user request)

## Decisions locked (with the requester, before planning)

- **Email channel** → open the user's local mail client via a pre-filled `mailto:`
  link (no SMTP, no credentials).
- **Microsoft Teams channel** → open Teams via the `msteams:` **scheme** deep link
  `msteams:/l/chat/0/0?users=<upn>&message=<short pointer>` (NOT the
  `https://teams.microsoft.com/l/...` form — the scheme launches the app directly and is
  reliably registered in tk's enterprise target environment; spike-verified 2026-06-13:
  opened the chat with the message pre-filled, in draft, no auto-send). `message=` is a
  short pointer only; the full report goes via the clipboard. Teams `users=` resolves only
  an **in-tenant Entra UPN**, so this reaches a recipient when the deployment configures
  its own internal UPN — see ADR 0011.
- **Destination** → **no baked-in address** (ADR 0011). Read only from `TK_SUPPORT_EMAIL` /
  `TK_SUPPORT_TEAMS` (Teams as an Entra UPN). When unset, `tk support` still gathers + saves
  the bundle and copies it to the clipboard, then prints a hint to set the env vars — it
  sends nowhere. tk targets enterprise-internal use, so each deployment routes support to
  its own in-tenant identity.
- **Error pop-up** → print a single one-line hint to **stderr only on tk's own
  errors** (fatal crash / surfaced hook-error / shim install failure). Never on a
  wrapped tool's own failure (fail-open contract). No auto-launch of the interactive
  flow (a hook's stdin is the host's JSON, not a TTY).

## Why this matters

When tk misbehaves on a user's machine, the only breadcrumb today is
`~/.token-killer/errors.log` — the user must know it exists and assemble a report by
hand. `tk support` gives a one-command path to **produce a shareable diagnostic** (recent
error + logs auto-**gathered** and saved; the file is attached/pasted by hand — `mailto:`
cannot auto-attach), **routed by the deployment's env config** (ADR 0011), with a gentle
nudge toward it whenever tk itself errors. Both channels reuse the existing cross-platform
opener, so this adds **no HTTP and no runtime dependency** (the project is strictly
zero-dep, Node ≥20).

## Current state (what we reuse — do not reinvent)

- **Diagnostic bundle** — `tk debug` already gathers exactly the "recent logs" content
  (version, platform, delivery health, command history, recent failures, `debug.log`,
  host configs) and renders markdown with home-dir scrubbing:
  - `collectDebugBundle({ cwd, full, redact }): Promise<DebugBundle>` — `src/debug/collect.ts:388`
    (`CollectOptions` at `:154`).
  - `renderDebug(b: DebugBundle): string` — `src/debug/render.ts:352`; `scrubHome` at `:25`.
  - **Gap**: the bundle does NOT capture `errors.log` (the real crash/hook-error feed).
    `tk support` tails it in via `errorLogPath()` — `src/hook/debug.ts:85`.
- **Cross-platform open** — `openInBrowser(path)` — `src/report/open.ts:30`: `spawn` of
  `open` / `cmd /c start "" <x>` / `xdg-open`, `detached`+`unref`, gated by `TK_NO_OPEN`.
  **Do NOT mirror the Windows branch for URIs.** `openInBrowser` only ever opens FILE
  paths; `mailto:`/`msteams:` URIs always contain `&`, and `cmd /c start "" <uri>`
  truncates at the first unquoted `&` (spike-verified 2026-06-13: method A FAILs, body
  lost; methods using quotes+`windowsVerbatimArguments` or no-cmd PASS). `openExternal`
  must open URIs without cmd: Windows → `rundll32 url.dll,FileProtocolHandler <uri>`
  (spike-verified end-to-end for `mailto:` + Teams), macOS `open` / Linux `xdg-open`
  unchanged.
- **Subcommand pattern** — lazy dispatch chain `src/cli.ts:219-251`; reserved set
  `RESERVED_SUBCOMMANDS` `src/parse.ts:64-82`; mode union `ParseMode` `src/types.ts:78-92`;
  handler shape `runX(argv): number | Promise<number>`, output via
  `process.stdout/stderr.write`, errors as `tk <sub>: <msg>\n` — canonical example
  `src/core/configCli.ts:10`.
- **Error writers (hint hooks here)** — both unconditional (not TK_DEBUG-gated), both
  already the "tk's own error" sinks, both `.toContain`-tested (not exact-match, so an
  appended hint line is safe):
  - `logFatalError(context, error)` — `src/hook/debug.ts:108`; sole caller is the
    top-level catch `src/cli.ts:470`.
  - `recordHookError(context, error, { surfaceStderr })` — `src/hook/debug.ts:129`
    (copilot surfaces stderr; claude stays silent by design).
  - `failOpenPassthrough` prints the bare error on true shim recursion — `src/cli.ts:457`.
  - `installShim` reports RC-patch / VS Code-settings failures via `err(...)` —
    `src/shim/cli.ts:91,104` (`err` at `:29`).

## Commands you will need

| Purpose        | Command                                                                 | Expected |
|----------------|-------------------------------------------------------------------------|----------|
| Install        | `pnpm install`                                                          | exit 0   |
| Typecheck      | `pnpm typecheck`                                                        | exit 0   |
| Targeted tests | `pnpm vitest run --config vitest.config.ts tests/unit/support tests/unit/hook/debug.test.ts` | all pass |
| Full suite     | `pnpm test:product`                                                    | all pass |
| Smoke / build  | `pnpm build && bash tests/smoke/smoke.sh`                              | passes; hot path untouched |
| Manual (no FX) | `TK_SUPPORT_EMAIL=x@y.z TK_NO_OPEN=1 pnpm dev support email --no-attach -y` | prints `mailto:` URI |

## Scope

**In scope:**
- New module `src/support/{cli,report,send}.ts` (all new files).
- `src/types.ts` — add `"support"` to `ParseMode`.
- `src/parse.ts` — add `"support"` to `RESERVED_SUBCOMMANDS`.
- `src/cli.ts` — one lazy-dispatch branch + `help()` text; one hint call in
  `failOpenPassthrough`.
- `src/hook/debug.ts` — add `emitSupportHintOnce()` + `resetSupportHintForTest()`;
  call it from `logFatalError` and from `recordHookError` (only when `surfaceStderr`).
- `src/shim/cli.ts` — call `emitSupportHintOnce()` after the two `installShim` `err(...)`
  failure branches.
- New tests under `tests/unit/support/`; extend `tests/unit/hook/debug.test.ts`.
- `README.md` — one-line mention (optional; `validate-docs.sh` does not gate it).

**Out of scope (do NOT touch):**
- `src/core/config.ts` schema — destination is **env-only** (ADR 0011), never persisted
  config; the config writer regenerates from a closed template and would not preserve
  custom keys anyway.
- Any SMTP / HTTP / Teams-webhook send path; any auto-launch-on-error behavior.
- `recordHookError` callers that pass no `surfaceStderr` (claude stays silent —
  `src/hook/claude.ts`); the wrapped-tool failure path / `runCompress` hint
  (`src/cli.ts:432`).

## Git workflow

- Branch: `feat/tk-support-command` (current branch at plan time: `token-killer-node-cli`).
- Conventional commit, e.g. `feat(support): add tk support — email/Teams report with auto-attached error + logs`.
- Do NOT push or open a PR unless the operator instructs it.

## Steps

### Step 1 — `src/support/send.ts` (pure builders + openers)
- **No baked default address** (ADR 0011). `resolveDestination(kind: "email"|"teams",
  override?: string): string | undefined` — precedence `override > TK_SUPPORT_EMAIL |
  TK_SUPPORT_TEAMS env`; returns `undefined` when unset (caller degrades to
  save+clipboard+hint, sends nothing).
- `buildMailto(to, subject, body): string` → `mailto:<to>?subject=<enc>&body=<enc>`,
  body = compact **summary** only (mailto cannot auto-attach, so the full report is the
  saved file, attached by hand and referenced by path in the body). Keep the URI well
  under client limits.
- `buildTeamsDeepLink(upn, message): string` → `msteams:/l/chat/0/0?users=<upn>&message=<enc>`
  (**scheme** form, not `https://teams.microsoft.com/...`; launches the app directly).
  `message` = a short pointer; the full report travels via the clipboard.
- `openExternal(uri): boolean` — honor `TK_NO_OPEN`; **Windows uses
  `rundll32 url.dll,FileProtocolHandler <uri>`** (NOT `cmd /c start`, which truncates the
  URI at the first `&` — see Current state), macOS `open` / Linux `xdg-open` as in
  `openInBrowser`.
- `copyToClipboard(text): boolean` — best-effort, **presence-gated** (`pbcopy`/`clip`/
  `xclip`/`wl-copy`); never throws; returns false when no tool is available.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2 — `src/support/report.ts` (reuse the debug collector)
- `buildSupportReport({ cwd, redact }): Promise<{ markdown: string; summary: string }>`:
  - `bundle = await collectDebugBundle({ cwd, full: false, redact })`.
  - `markdown = renderDebug(bundle)` + a `## Recent errors (errors.log)` section from
    `tailFile(errorLogPath(), N)` passed through `scrubHome`.
  - `summary` = compact one-screen text from `bundle.env` (version/platform/node/host) +
    `bundle.delivery.anyWired/brokenHook` + recent-failure count + last errors.log line.
- `tailFile(path, maxLines): string` — best-effort read-last-N; missing ⇒ `"(none)"`.
- `writeSupportBundle(markdown, nowMs): string` — write `~/.token-killer/reports/support-<ts>.md`
  (reuse the `reports/` dir + ISO-flattened stamp convention from `src/report/open.ts`).

**Verify**: `pnpm typecheck` → exit 0.

### Step 3 — `src/support/cli.ts` (`runSupport`)
- Parse: positional `email|teams`; flags `--no-attach`, `--redact`, `--email <addr>`,
  `--teams <upn>`, `-y|--yes`, `--help`. Unknown flag ⇒ `tk support: unknown flag '<x>'\n`,
  return 1.
- TTY gate `process.stdin.isTTY && process.stdout.isTTY`. Interactive flow:
  1. **Choose type** (if no positional channel): prompt
     `Reach support via: [1] Email  [2] Microsoft Teams`.
  2. **Attach recent error**: prompt `Attach the most recent error and recent logs? [Y/n]`.
  - Prompts via `node:readline/promises`.
- Non-interactive: non-TTY + no channel ⇒ print usage, return 1. With channel + `-y`
  (or non-TTY) ⇒ attach defaults to true unless `--no-attach`.
- **Disclosure (always, before opening any channel)**: the bundle leaves the machine, so
  before opening the channel print exactly what it contains — "shell commands you ran +
  their output, tk logs, host config, environment (home dir scrubbed); **NO chat prompts**"
  — and that the user reviews and sends by hand (that manual send is the explicit per-run
  opt-in the [Raw evidence] contract requires). `--redact` reduces it to lengths/labels.
- If attaching: `buildSupportReport` → `writeSupportBundle` (save first; durable). Print the path.
- **Resolve destination** (`resolveDestination`). **If `undefined` (no env): copy the report
  to the clipboard, print the saved path + "set `TK_SUPPORT_EMAIL` / `TK_SUPPORT_TEAMS` to
  enable one-tap send", exit 0 — send nothing** (ADR 0011).
- Dispatch (destination set):
  - **email** → `openExternal(buildMailto(to, subject, summary))`; print "attach this file:
    <path>" (the saved file is the carrier; clipboard untouched).
  - **teams** → `copyToClipboard(fullMarkdown)` (the carrier) →
    `openExternal(buildTeamsDeepLink(upn, pointer))`; print the file path + "paste from your
    clipboard into the chat".
  - Under `TK_NO_OPEN` or opener failure: print the URI + file path (+ Teams clipboard note)
    for manual use.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4 — Register the subcommand
- `src/types.ts` — add `"support"` to the `ParseMode` union.
- `src/parse.ts` — add `"support"` to `RESERVED_SUBCOMMANDS`.
- `src/cli.ts` dispatch (beside the others):
  `if (parsed.mode === "support") return (await import("./support/cli.js")).runSupport(parsed.subArgs ?? []);`
- `src/cli.ts` `help()` — add a `support` line to the Commands list and a usage block.

**Verify**: `pnpm dev support --help` prints usage; `pnpm dev --help` lists `support`.

### Step 5 — Error pop-up hint
In `src/hook/debug.ts`:
```ts
let supportHinted = false;
const SUPPORT_HINT = "↳ Run `tk support` to send this error + recent logs to the maintainer.";
export function emitSupportHintOnce(): void {
  if (supportHinted) return;
  supportHinted = true;
  try { process.stderr.write(`${SUPPORT_HINT}\n`); } catch { /* never break a fail-open path */ }
}
export function resetSupportHintForTest(): void { supportHinted = false; }
```
Call `emitSupportHintOnce()` at the end of `logFatalError`, inside `recordHookError`
**only when `opts.surfaceStderr`**, in `src/cli.ts` `failOpenPassthrough` (after the
error write), and in `src/shim/cli.ts` after each `installShim` `err(...)` failure (the
once-guard collapses multiple failures to a single hint). Stderr only — never stdout,
never `errors.log` (keep it a clean machine log).

**Verify**: `echo 'not json' | pnpm dev hook copilot` → exit 0, hint on stderr.

### Step 6 — Tests (`tests/unit/support/`)
- `send.test.ts` — destination precedence (override > env; **`undefined` when unset**, no
  baked default); mailto encoding + summary body + correct `to`; Teams **`msteams:`** scheme
  `users=`/`message=` encoding; `openExternal` Windows branch spawns **`rundll32`** (NOT
  `cmd`) — assert a `&`-containing URI reaches argv intact; `openExternal`/`copyToClipboard`
  no-op + return value under `TK_NO_OPEN` / when no clipboard tool is present.
- `report.test.ts` — summary contains version/platform/host; errors.log tail included
  and home-scrubbed; `--redact` ⇒ length-only; missing logs ⇒ `(none)`. (Use
  `TOKEN_KILLER_HOME` isolation — see `tests/setup`.)
- `cli.test.ts` — `support email --no-attach -y` and `support teams -y` dispatch and
  exit 0; non-TTY + no channel ⇒ usage + exit 1; unknown flag ⇒ `tk support: …` + 1.
- Extend `tests/unit/hook/debug.test.ts` — `emitSupportHintOnce` writes once; fires from
  `logFatalError` and `recordHookError({surfaceStderr:true})`, NOT from plain
  `recordHookError()`; `resetSupportHintForTest()` in `beforeEach`.

**Verify**: targeted tests pass, then `pnpm test:product` → all pass.

## Test plan

Steps 6 covers builders (pure, table-driven), report assembly (collector reuse +
errors.log tail + redaction), the CLI's non-interactive dispatch, and the hint
firing/dedup. Interactive prompts are exercised via the flag escape hatches; the
`node:readline/promises` path itself is left to manual verification (Step in
Verification §3).

## Done criteria

Machine-checkable. ALL must hold:
- [ ] `pnpm typecheck` exits 0; `pnpm test:product` exits 0.
- [ ] `pnpm dev support` lists in `tk --help`; `tk support --help` prints usage.
- [ ] `TK_SUPPORT_EMAIL=… TK_NO_OPEN=1 pnpm dev support email -y` prints a `mailto:` URI to
      the env address; `TK_SUPPORT_TEAMS=… … support teams -y` prints the `msteams:` deep
      link + saved bundle path + clipboard note. With NO env, `… support email -y` saves the
      bundle + copies the clipboard + prints the "set `TK_SUPPORT_*`" hint and sends nothing.
- [ ] A surfaced hook error (`echo 'not json' | pnpm dev hook copilot`) prints the
      `↳ Run \`tk support\`…` hint on stderr and still exits 0.
- [ ] The hint never appears on a wrapped tool's own failure (e.g. a shimmed `git`
      command exiting non-zero) — verified by inspection of the injection sites.
- [ ] `pnpm build && bash tests/smoke/smoke.sh` passes; support is lazily imported (not
      on the compression hot path).
- [ ] No files outside the in-scope list are modified (`git status --short`).
- [ ] `plans/README.md` status row updated.

## STOP conditions

Stop and report (do not improvise) if:
- The "Current state" excerpts don't match live code (drift).
- `logFatalError`/`recordHookError` are called from sites beyond those listed (the hint
  would surface in unexpected places — report the call graph).
- `collectDebugBundle` cannot run without network/extra deps in this tree (it should be
  pure local I/O + best-effort spawns) — report rather than work around.
- A baked-in default address reappears anywhere — there must be NONE (ADR 0011); routing is
  env-only. If a default seems necessary, stop and report rather than inventing one.

## Maintenance notes

- Routing is **env-only** (ADR 0011); persisting a custom destination to `config.jsonc` is
  explicitly NOT planned (it would need a merge-writer, not the closed-template
  regenerator). Deferred: a free-text description prompt (today the user types their
  description in the mail client / Teams chat).
- If the `msteams:` scheme proves unreliable on a host (e.g. Teams not installed, so the
  scheme is unregistered), the fallback is the `https://teams.microsoft.com/l/...` form
  (opens via the browser) or the webhook POST (reuses `src/telemetry/send.ts`'s
  `node:https` pattern) — a one-channel swap, not a redesign.
- New host adapters with their own error surfaces should call `emitSupportHintOnce()`
  at their fatal/anomaly sites for consistent coverage.
