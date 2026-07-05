# Vision

## North Star

A **Developer Context Infrastructure** for enterprise engineers and AI agents.

> Unify local code facts, business-domain knowledge, project history,
> organizational knowledge, persistent memory, and live runtime state into one
> trustworthy, traceable, task-projected developer context — serving **Human and
> Agent** from the same base.

Reducing tokens is not a first-order goal. It is a natural result of context
being managed precisely.

## The core idea

The same context serves both an engineer and an AI agent. There are not two
datasets and not one fixed protocol — there is one base, projected per task,
delivered through many forms. Three layers compose into the context a task
actually needs:

- **Organization Base (server)** — org & teams, services & platform, standards &
  policy, cross-project relations, and **live runtime status** (of any service,
  including this project's own — status is always a live fact, so it lives
  server-side). Provided by Atlas; governed and citable.
- **Project Mainline (local)** — the project's formal knowledge: code &
  engineering facts, the Terraform-declared **architecture** (shape, not status),
  business-domain knowledge, project history, architecture decisions, project
  memory, and CodeWiki. Derived from the repo; deterministic, private, offline.
- **Local Workspace Overlay (local)** — where the live present diverges from the
  committed Mainline: the working-copy delta (branch & local diffs), the current
  task, transient verification results (test / build / lint), and task & session
  memory. These are exactly the facts that are *true right now and only for me* —
  the four things an agent must know to not reason about stale code, lose its
  task, re-run what it already ran, or repeat what it already tried.

```
Organization Base + Project Mainline + Local Workspace Overlay
                = Task-oriented Developer Context
```

## Context Projection — the central capability

> Given an explicit task and scope, select, relate, rank, and organize the
> context that is actually needed, across the three layers.

Projection is what turns a pile of sources into a precise, task-shaped context.
It does not guess intent — the task and scope are supplied by the caller. The
same projection feeds both surfaces:

- **Human surface** — CodeWiki, Portal, IDE, visualization.
- **Agent surface** — MCP, CLI, API/SDK, hooks, context files.

## Where the parts sit

- **CodeGraph** — deterministic code and engineering facts; the local store.
- **CodeWiki** — the human projection that organizes code, domain, history, and
  memory over the graph; a surface, not a second store.
- **Atlas** — the organization context platform (Context API + Portal); the
  server layer.
- **tk / Token Killer** — the tool-output context filter: compresses command
  output, keeps the key facts and evidence, raises signal density. It does not
  orchestrate context or query the graph. It is also the **wedge** — local,
  zero-dependency, value on day one, no organizational buy-in required. And
  because every tool output flows through it, tk sits exactly where part of the
  Overlay is observable for free — verification results and git state. v1 keeps
  tk a pure filter; feeding those observations into the Workspace Overlay as a
  passive sensor is a recorded future direction, not built.

## Invariants (what never changes)

1. **One base, not two datasets.** Human and agent read the same context through
   different surfaces.
2. **Static is local, live is server.** Anything derivable from the repo's
   source is local and offline; any runtime status — even of your own project —
   is live, and lives server-side.
3. **Memory is local, meaning never egressed — not un-shared.** There is no org-level server
   memory; "local" is the egress boundary (no org server, no vendor store), not a sharing
   boundary. Durable **project** memory is committed into the project's own git repo and shared
   with the team through it: it lives in the committed **Mainline** (git-synced), while session/
   task memory — *true right now and only for me* — lives in the personal **Overlay** (gitignored,
   never synced). **Git is the memory sync layer, textual only:** it merges bytes (concurrent
   appends auto-merge); semantic contradictions are caught at post-merge reindex, never by git.
4. **Provenance first.** Every fact carries its source, scope, and confidence.
   The product never fabricates; the server layer never durably mirrors a system
   of record; the local layer never leaves the machine.
5. **Token reduction is a side effect, not a goal.**

## Naming

The brand is still open. "Developer Context Infrastructure" is the category;
"Atlas" names the organization-context platform; the umbrella product name is
not yet fixed. The thesis is what holds: **one base, projected per task, serving
human and agent.**
