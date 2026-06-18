---
status: superseded
superseded-by: 0013-support-destination-baked-at-build
---

# `tk support` routing is env-configured, with no baked-in destination

> **Superseded by [ADR 0013](0013-support-destination-baked-at-build.md).** The destination
> is now baked at build time (the packager's identity), not read from a runtime env var, and
> the `--email`/`--teams`/`--github` override flags are removed. ADR 0013 keeps this ADR's
> core property — a generic public build carries no address and sends nowhere.

`tk support` ships with **no** default support address. The destination is read only from
`TK_SUPPORT_EMAIL` / `TK_SUPPORT_TEAMS` (Teams as an Entra UPN) / `TK_SUPPORT_GITHUB` (an
`owner/repo` slug or a full repo URL for a GitHub Enterprise host). When none is set,
`tk support` still gathers and saves the [Support bundle](../../CONTEXT.md) and copies it
to the clipboard, then prints a hint to set the env vars — it sends nowhere. tk targets
enterprise-internal environments, so each deployment routes support to its own in-tenant
identity; a `msteams:` chat deep link (`users=<UPN>`) resolves **only** for an in-tenant
Entra UPN, so a baked consumer address could not be a reachable Teams target anyway.

## Considered options

- **Bake a default (e.g. the author's `@outlook.com`), env-overridable.** Rejected: ships a
  personal address into every public npm install; a consumer Microsoft Account cannot be a
  resolvable Teams `users=` target from another tenant (verified against the Teams deep-link
  spec — `users=` takes a Microsoft **Entra** UserPrincipalName); and it makes a false
  "reach the maintainer" promise that only ever works for email.
- **Bake a role/Entra UPN the author controls.** Rejected: still public in npm, still
  cross-tenant-unreliable for Teams, and no durable shared identity exists to bake.
- **Env-only (chosen).** No address in the build; an enterprise routes support to its own
  in-tenant helpdesk UPN, which resolves in its own Teams and reaches its own people.

## Consequences

- Out of the box (no env), `tk support` reaches **no one** — it produces a saved report +
  clipboard copy only. This intentionally reframes the feature from "reach the tk
  maintainer" to "produce a shareable diagnostic, routed by the deployment." tk's own
  author therefore does not receive field reports unless they also set the env vars.
- No personal address is published in the package; the `src/core/config.ts` schema is left
  untouched (routing is env, not persisted config).
- Channel mechanics are unaffected by this decision: email opens a `mailto:` draft (full
  report attached by hand), Teams opens an `msteams:` chat (full report pasted from the
  clipboard), GitHub opens a pre-filled `issues/new` draft (full report pasted in or the
  saved file drag-dropped); none auto-sends.
