---
status: accepted
supersedes: 0011-support-routing-env-configured
---

# `tk support` destination is baked at build time, not configured at runtime

`tk support` reaches **whoever packaged the build** — the maintainer. So the destination
is a property of the *distribution*, fixed by the packager, not something the end user
configures or overrides at runtime. The build bakes one address per channel via tsdown's
`define`:

- `__TK_SUPPORT_EMAIL__` ← `process.env.TK_SUPPORT_EMAIL` at build time
- `__TK_SUPPORT_TEAMS__` ← `process.env.TK_SUPPORT_TEAMS` (an Entra UPN)
- `__TK_SUPPORT_GITHUB__` ← `process.env.TK_SUPPORT_GITHUB` (`owner/repo` slug or a full
  repo URL for a GitHub Enterprise host)

This mirrors the telemetry-endpoint build arg (ADR 0004 §5, `src/telemetry/endpoint.ts`):
a generic build bakes `""` ⇒ that channel has no destination and degrades to
save+clipboard+hint; an enterprise build bakes the maintainer's address. Under tsx/vitest
there is no `define`, so `resolveDestination` falls back to the matching `TK_SUPPORT_*`
env var — the test/local-dev path only; a real build always replaces the identifier, so
the env fallback is unreachable in production.

The end user still picks the **channel** (`email` | `teams` | `github`, prompted in a TTY),
never the address.

## Why this supersedes ADR 0011 (env-only routing)

ADR 0011 routed support via runtime env vars (`TK_SUPPORT_EMAIL` / `TK_SUPPORT_TEAMS` /
`TK_SUPPORT_GITHUB`) and shipped no baked destination, on the reasoning that each *deployment*
sets its own in-tenant identity. In practice the destination is the **packager's** identity,
decided when the distribution is built — not something each end user should set or be able
to retarget. A runtime `--github someone/else` (the old override flags) let any user redirect
a diagnostic bundle to an arbitrary repo, which is wrong for a "reach the maintainer" feature.

Baking at build time keeps ADR 0011's core property — no personal address in a generic
public build (it bakes `""` and sends nowhere) — while fixing the identity at the only point
that actually knows it: the build.

## Considered options

- **Runtime env-only (ADR 0011, now superseded).** Rejected: the destination is a build/
  distribution property, not a per-machine one; the override flags let end users retarget
  the bundle; and the env var is a footgun (forget to set it ⇒ no support).
- **Bake at build via tsdown `define` (chosen).** The packager sets `TK_SUPPORT_*` in the
  build environment; the value is inlined as a compile-time literal and cannot be changed by
  a runtime env. A generic build bakes `""` and remains inert.
- **Bake a default address into the source.** Rejected for the same reasons as ADR 0011:
  ships a personal address into every public install; cross-tenant-unreliable for Teams.

## Consequences

- The `--email` / `--teams` / `--github` override flags are **removed**. `tk support` takes
  only the channel positional + `--no-attach` / `--redact` / `-y`.
- A generic (non-enterprise) build bakes no destination ⇒ `tk support` saves the report,
  copies it to the clipboard, and prints a hint that this build configured no destination —
  it sends nowhere. Identical end-user-visible degradation to ADR 0011's "no env set".
- To produce an enterprise build that reaches a helpdesk, set `TK_SUPPORT_GITHUB` (or
  `_EMAIL` / `_TEAMS`) in the build environment before `pnpm build`.
- Tests drive the env-var fallback (no `define` under vitest), which exercises the same
  `resolveDestination` path a baked value takes at runtime.
