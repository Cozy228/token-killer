---
status: accepted
supersedes: none
---

# `ctx doctor` — one diagnose+repair verb; `ctx status` removed (rename hint)

`ctx status` only ever *reported* (the install matrix + a refreshed verification
timestamp). Repair lived elsewhere (`ctx install` re-run) and the metrics store had no
health surface at all — a project bucket whose `meta.json` drifted showed up in
`ctx gain --user` as a bare hash (`a47085322e05`) or a stale/wrong name, with no command
to fix it. `ctx doctor` unifies *diagnose* and *repair* across BOTH halves of an install:

- **delivery** — the per-tier capability matrix (hook / shim / injection / guidance).
- **records** — the metrics store under `~/.contexa/projects/*` (rollup freshness,
  duplicate `repo:`/`repo-` buckets, empty dirs, and orphan/junk-named project buckets).

Read-only by default (it prints each fixable finding as `would fix …`); `--fix` applies
repairs. `ctx status` is **removed**: the dispatcher prints a rename hint (`ctx status` →
`ctx doctor`, mirroring the `ctx init` → `ctx install` hint) rather than carrying a permanent
alias, so there is exactly one health verb.

## Project identity is irreversible — so name recovery is best-effort

A bucket is keyed by `repo:<sha>` = a one-way hash of the repo-root path (ADR 0004 §3,
`dataDir.ts`). The display name lives in a sibling `meta.json` (`{label}`), self-healed on
every command — **but only for the repo you are currently in**. A bucket you never revisit
cannot be renamed from the store alone, because the hash cannot be inverted. So normalization
is a ladder, not a guarantee:

1. **Deterministic (no external input):** rebuild stale rollup caches from `history.jsonl`
   (the source of truth), merge `repo:`/`repo-` duplicate dirs (a store copied between POSIX
   and Windows, where the colon is path-illegal), heal the *current* repo's name, prune dead
   dirs.
2. **Best-effort recovery (`--fix <scan-root>`):** walk a directory for real git repos, hash
   each, and match the fingerprint back to an orphan bucket → write its real `meta.json` name.
3. **Archival (whatever stays unresolved):** fold every still-orphan (hash-named) bucket into
   one synthetic `archived` bucket — its history rows are **merged, not dropped**, so the
   token TOTALS are preserved — then delete the hash-named directory. Reports then show one
   clean `archived` row instead of N bare hashes.

The archival step is the resolution of a real tension: the user wants reports to never show a
weird/hash project name, *and* wants the saved-token totals kept. Deleting a bucket would lose
the tokens; relabeling N orphans to "unknown" leaves N ugly rows. Merging into one `archived`
bucket satisfies both — hashes gone, totals intact, directories cleaned up.

## Safety

- Only **pure-hash, never-successfully-named** buckets are archived. A bucket that already has
  a usable label (an active project, self-healed) is never touched, so a live project can't be
  swept into `archived` just because it wasn't under the scan root.
- Read-only `ctx doctor` is the preview gate: it lists exactly what `--fix` would archive/merge
  before anything is written.
- `--fix` never AUTO-installs a host that was never set up — it only re-runs the installer for
  the host recorded in `delivery-state.json` when a tier it wired has gone missing.
- Every repair is fail-open and best-effort; a failure leaves the (already-correct) source of
  truth (`history.jsonl`) untouched and degrades to "rebuild on next `ctx gain`".

## Considered options

- **Keep `status` read-only; add separate `ctx repair` / `ctx rebuild` / `ctx normalize`.**
  Rejected: fragments one mental model ("is my ctx healthy?") across several verbs and a bigger
  flag surface. The user explicitly wanted cohesion and a minimal surface.
- **Auto-fix on a bare `ctx doctor`.** Rejected: violates ctx's safe-default convention
  (`optimize`, `uninstall` are read-only until a flag) and would mutate the store with no
  preview.
- **`ctx doctor` + `--fix` + optional `scan-root` positional (chosen).** One verb, one flag,
  one optional positional. Read-only previews; `--fix` repairs; the scan root unlocks name
  recovery. `ctx status` is removed (rename hint), so there is one health verb, not two.

## Consequences

- New surface: `ctx doctor [--fix] [scan-root]`. `ctx status` is removed; the dispatcher
  prints a rename hint for the old name (like `ctx init`), and a `status` program can no
  longer be shadowed by a ctx verb.
- New module `src/core/recordsHealth.ts` owns store diagnosis + repair primitives
  (`diagnoseRecords`, `mergeDuplicateBuckets`, `recoverOrphanNames`, `archiveUnresolvedOrphans`,
  `pruneEmptyBuckets`, `rebuildAllRollups`); `src/shim/doctor.ts` orchestrates and renders.
  `runStatus` was split into `gatherStatus()` + `renderStatusReport()` so doctor reuses the
  matrix programmatically (`tiers[].installed`) to decide tier repair.
- A synthetic `archived` bucket may appear in `ctx gain --user`. It carries the preserved token
  totals of unrecoverable projects and is never re-flagged as an orphan.
- `ensureProjectMeta` is now exported from `core/history.ts` so doctor can force-heal the
  current repo's name.
