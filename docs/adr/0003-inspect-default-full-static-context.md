---
status: accepted
---

# Scope-aware `ctx inspect`: user-level default, project opt-in, default `latest.json` write

> **Amended by [ADR 0006](0006-cli-consolidation-and-optimize-apply-engine.md) (2026-06-07):**
> the "project-level writes" non-goal and the "project files are never modified"
> invariant are superseded. `ctx optimize --apply` is git-aware and writes
> deterministic fixes into project-tracked files (disclosed, backed up,
> `--restore`-able). `ctx optimize context` is now `ctx optimize`.

## Context

[Inspect](../../CONTEXT.md#surfaces) shipped (Slice 4–5, `docs/inspect-v1-design.md`) as a
read-only scanner over **Copilot session evidence only**. inspect-v1 lists as explicit
**non-goals**: "path-based source scans", "project-level configuration or writes", and the
core promise "no default repository scan, no default file writes". Today bare `ctx inspect`
scans VS Code transcript storage, persists nothing unless `--write-advice` is passed, and
returns exit 2 early when no session source is found.

The Copilot Context Optimizer (DESIGN §4, `docs/context-optimizer-implementation-goal.md`)
adds **static context** analyzers — they read the context surfaces Copilot loads
(`.github/**`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, Claude `SKILL.md`, and the user-level
equivalents `~/.claude/CLAUDE.md`, `~/.claude/skills`, `~/.copilot/copilot-instructions.md`).
DESIGN insists there is **one** `ctx inspect` that runs every analyzer and emits a unified
[Finding](../../CONTEXT.md#findings-and-optimization) report; `ctx optimize context` is the
downstream consumer that reads the persisted report.

Two questions had to be settled. **(1) Default scope.** `ctx inspect` must be runnable
anywhere, and global context loads into *every* session across *every* project — so it is the
highest-leverage token cost, not a peripheral one. Making global context opt-in would hide the
single most impactful thing to inspect. **(2) Persistence.** The consumer loop needs a
default-written report, which collides with inspect-v1's "no default file writes".

## Decision

1. **Static context is scope-aware, and the default scope is user-level.** Bare `ctx inspect`
   (runnable anywhere) reads **user-level** global context. `--project` selects the current
   repo; `--project --user` does both. Project scope is opt-in because global context has the
   widest blast radius and because a project report should not be cluttered by global findings
   unless asked. See CONTEXT.md, *[Scope](../../CONTEXT.md#evidence-classes)*.

2. **Runtime (session) analysis is orthogonal to scope and always runs**, unless
   `--copilot-context` narrows the run to static-context analyzers only. Scope flags
   (`--project`/`--user`) and the analyzer-type flag (`--copilot-context`) compose freely.

3. **inspect writes a per-scope `latest.json` on every run, by default**, into separate
   buckets — `~/.contexa/user-context/inspect/latest.json` (no fingerprint) and
   `~/.contexa/projects/<fingerprint>/inspect/latest.json`. This **supersedes** the
   inspect-v1 "no default file writes" non-goal. It does **not** violate the
   [User-level](../../CONTEXT.md#evidence-and-recovery) rule: the write is user-level, never
   into the project repository. Separate buckets keep global findings from being duplicated
   across projects or left stale. `--write-advice` artifacts remain a separate concern.

4. **Reading curated context files is not the superseded "source scan".** "No source-code
   analysis" and "no path-based source scans" remain fully in force — only the named context
   files are read, never arbitrary source. What is superseded is "no default repository scan"
   (now: `--project` reads a bounded context-file set) and "no default file writes" (item 3).

5. **`<fingerprint>` (project bucket only) is a hash of git identity** — `git remote origin`
   URL when present, else the `git` toplevel absolute path — falling back to a hash of the
   absolute cwd outside a git repo. Only the hash is stored, never the path. Two clones of the
   same remote share one report (accepted: same project = same advice).

6. **No raw instruction bodies are persisted.** `latest.json` stores `file`, line range,
   `type`, counts, `scope`, and `body_hash`. `ctx optimize context` re-reads the live file to
   build a `suggested_diff`, validating against `body_hash` and prompting a re-inspect on
   mismatch (stale guard).

7. **Exit codes keep inspect-v1 semantics, not the goal draft's.** `2` means *no source at
   all* in the requested scope(s) (runtime **and** static context both unanalyzable) — inspect
   no longer early-returns 2 just because session storage is absent. Findings never change the
   exit code; the opt-in `--fail-on` uses a **separate** code (`4`), not a reuse of `2`.

## Considered options

- **Default to user+project both, `--project`/`--user` to narrow.** Considered and rejected
  in favor of user-only default: a bare run in a repo should not dump project findings unless
  asked, and user scope is the one guaranteed-meaningful scope anywhere. `--project` is the
  one extra token to opt into repo analysis.
- **Default to project-level, user-level opt-in (`--user-context`).** Rejected: inverts the
  token-leverage priority — it makes the highest-impact surface (global context) the
  hard-to-reach one and ties inspect to being inside a repo.
- **One merged `latest.json` per project containing both scopes.** Rejected: duplicates the
  same global findings into every project and lets them go stale per project; separate buckets
  compute global findings once.
- **Persist raw instruction bodies so optimize need not re-read.** Rejected: lands project
  text on user-level disk and breaks the no-raw-bodies posture; re-read + hash-check is more
  private and more accurate.
- **Adopt the goal draft's exit table (`2 = findings above threshold`).** Rejected: overloads
  code `2` against inspect-v1's "no source" meaning and makes a diagnostic command fail on
  findings by default.

## Consequences

- `src/inspect/cli.ts` gains scope flags (`--project`/`--user`, default user) and must stop
  early-returning `2` on missing session sources; the "no source" check moves to *after* both
  runtime and static-context discovery for the requested scope.
- Two persistence buckets + writers are added (`user-context/` and
  `projects/<fingerprint>/`); a fingerprint helper reuses the git-identity logic in
  `src/inspect/repoContext.ts`.
- `ctx optimize context` is project-scoped by default and reads the project bucket; user-level
  work (`--surface skills`) reads the user bucket. When a bucket is absent it triggers a full
  inspect for that scope (`ctx inspect --project` or `--user`). It re-reads project files and
  needs the `body_hash` stale guard; `src/context/metrics.ts` emits `body_hash` and section
  hashes.
- `ContextFinding` gains a `scope: "user" | "project"` field driving report sectioning and
  bucket routing.
- `inspect-v1-design.md` cross-references this ADR where it states the superseded non-goals.
- DESIGN §4.1 / §9 gain the scope flags and the user-default note.
