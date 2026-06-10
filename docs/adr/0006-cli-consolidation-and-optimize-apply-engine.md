---
status: accepted
---

# CLI surface consolidation and the `tk optimize --apply` engine

## Context

The `tk` command surface accreted standalone verbs that overlapped or exposed
internals: `tk shim` (whose install/status/uninstall were already orchestrated by
`tk init`), `tk report` (a back-compat alias for `tk gain report`), `tk agentsmd`
(which shared `applyMarkerBlock` with `tk optimize`), `tk optimize context` (a
required `context` sub-target with only one possible value), and
`tk telemetry purge` (a device-id reset we do not want to advertise to users).
The central `--help` listed usage syntax only — no per-command descriptions — so
the relationship between forward-looking `inspect`, file-writing `optimize`, and
backward-looking `gain` was invisible.

Separately, [ADR 0003](0003-inspect-default-full-static-context.md) and the
original safe-apply rules (`src/context/applySafe.ts`) held a hard invariant:
**project files are never modified**, and `--apply-safe` only auto-wrote a
`safe_mechanical` subset at the **user** scope. In practice this meant a
genuinely deterministic, reversible fix (e.g. `disable-model-invocation: true` on
a side-effect skill) could be written to a user-level skill but only *suggested*
for a project-tracked one — even though the same fix is equally safe in a repo
once it is disclosed and backed up.

## Decision

**1. Consolidate the command surface.**
- `tk shim` is removed as a top-level verb. Its operations live under
  `tk init shim <install|status|uninstall>`; the default `tk init` still installs
  the shim via its tier ladder. (Amends [ADR 0002](0002-shim-delivery-tier-and-passthrough.md).)
- `tk report` (the alias) is removed. The detailed report is reached only via
  `tk gain report`. (Amends [ADR 0004](0004-opt-in-network-telemetry-and-gain-parity.md).)
- `tk agentsmd patch|restore` is removed; the managed token-budget block is
  managed by `tk optimize --token-budget-block` (install) and
  `--token-budget-block --restore` (remove).
- `tk optimize context` becomes `tk optimize` — the `context` token is optional
  (still accepted for back-compat). `tk optimize` runs anywhere.
- `tk telemetry purge` is no longer a user-facing subcommand; `purgeState()`
  stays an internal helper. (Amends ADR 0004.)
- `--help` is rewritten with a `Commands:` section and per-command option
  descriptions.

**2. Replace `--apply-safe` with `--apply`, git-aware and project-writable.**
- Scope is resolved by git presence: outside a git work tree `tk optimize`
  operates on the **user** scope only; inside a git repo it operates on **both**
  the user and project scopes. `--user` / `--project` force a single scope.
  (Supersedes ADR 0003's "project-level configuration or writes" non-goal and the
  "project files are never modified" invariant.)
- `--apply` applies **every deterministic ("A-class") change** — frontmatter sets
  and managed marker blocks — across the resolved scopes, including
  project-tracked files. The `userScope ? safe_mechanical : suggested_diff` gate
  on `skill_invocation_policy` is lifted: the deterministic invocation fix is now
  `safe_mechanical` at either scope.
- Free-form **"B-class" findings (`suggested_diff`)** — content rewrites such as
  `always_on_bloat` or `skill_entrypoint_bloat` — are **printed for manual review
  (and for pasting into an AI prompt), never auto-written**, because they are not
  guaranteed to apply cleanly.

**3. Safety is procedural, not a write-ban.** Before any write, `--apply`
discloses the full plan (every file, scope, and diff). Each touched file is
backed up under `~/.token-killer/backups/context/<ts>/` with a `manifest.json`
mapping each backup to its target, so `tk optimize --restore` reverts the most
recent apply.

## Consequences

- `tk optimize --apply` can now modify repo-tracked files (`AGENTS.md`,
  `.github/**`, `.claude/skills/**`, etc.) inside a git repo. This is intentional
  and is guarded by disclosure + backup + `--restore`, not by refusal.
- The honest boundary is the A-class/B-class split, not the scope: mechanical
  fixes are written everywhere; semantic rewrites are always suggestions.
- End-to-end coverage in `tests/integration/optimize.test.ts` exercises a real
  inspect→apply→restore round-trip on a git-tracked project skill.
