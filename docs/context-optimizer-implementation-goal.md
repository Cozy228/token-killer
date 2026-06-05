# Goal: Ship Copilot Context Optimizer inspect + optimize

Drive agent sessions that build Token Killer's static context optimizer for GitHub Copilot
workflows. This is not command-output compression. It diagnoses and improves the files that
Copilot, VS Code, Claude, Gemini, and Codex may load as instructions, prompts, agents, or
skills.

**Architecture (locked — read this first).** There is exactly **one `tk inspect`** (DESIGN
§9), and it **runs all analyzers by default** — runtime (prompt/session/tool/input/output)
*and* static context. The static context analysis this goal builds is **a set of analyzers
inside that one inspect**, contributing `source = static_context` findings to the unified
report. It is **NOT** a separate `tk inspect --copilot-context` scan command;
`--copilot-context`/`--surface`/`--project`/`--user` are only narrowing flags. Static context
is **scope-aware** (ADR 0003): bare `tk inspect` reads **user-level** global context by
default (highest token leverage, runnable anywhere); `--project` selects the current repo;
runtime analysis is orthogonal and always runs. The "context optimizer" is the **downstream
consumer** `tk optimize context`: it reads inspect's findings and makes targeted modifications.

The product shape is two-stage, and optimize itself has two layers:

1. **Inspect** (the one `tk inspect`, DESIGN §9): read-only; static-context analyzers
   produce findings with evidence, severity, surface, confidence, and an explicit
   `fix_class`, merged into inspect's unified `Finding[]` report.
2. **Optimize** (`tk optimize context`): consumes inspect's `source = static_context`
   findings, then separates work into:
   - **Direct modify / restorable**: mechanical, reversible writes such as Token Killer
     AGENTS/copilot-instructions marker blocks, Token Budget rules, high-confidence user-level
     skill invocation flags, and user-level VS Code `chat.tools.compressOutput.enabled`.
   - **Detect and advise**: findings that require semantic or team workflow judgment, including
     instruction restructuring, prompt/agent extraction, and broader VS Code Copilot settings.
   It first reads the
   persisted inspect report (`~/.token-killer/projects/<fingerprint>/inspect/latest.json`);
   if absent it triggers a **full** inspect run (runtime + static context), so `latest.json`
   is always a complete report. To build each suggested diff it re-reads the live project
   file, validated against the finding's stored `body_hash` — no raw instruction body is ever
   persisted, and a hash mismatch prompts a re-inspect instead of emitting a stale diff.

The direct managed instruction block is exactly:

```markdown
<!-- token-killer:start -->
## Token Budget
- Treat context as a limited budget; gather only what is needed to act safely.
- Search before reading: use `rg` / `rg --files`, then open focused files or line ranges.
- Prefer diffs, diagnostics, symbol hits, and targeted snippets over whole-file or full-log reads.
- Avoid generated files, dependency folders, build outputs, lockfiles, and ignored paths unless required.
- Cap command output and expand only when a specific missing detail is needed.
- Do not reread unchanged files; cite the earlier read instead.
- Stop exploring once there is enough context to implement or answer safely.
- When running terminal commands for the agent, use `tk <original command>` when a `tk` handler exists; use raw commands only when exact output or interactivity is required.
<!-- token-killer:end -->
```

Everything outside this managed block is advice unless another direct-restorable rule
explicitly allows it.

## Source of truth

- `docs/DESIGN.md` §4 and §5 define the product boundary; **§9 defines the one `tk inspect`**
  (default-full) and §9.0 its unified `Finding` model — static context is a `source =
  static_context` analyzer inside it, and §10.5 defines the inspect → optimize consumer loop.
- `docs/inspect-v1-design.md` defines the inspect posture: no source-code analysis, no
  exact token accounting, no project-level writes.
- GitHub Copilot custom instruction docs define the supported Copilot surfaces:
  `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md`,
  `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`.
- VS Code docs define prompt files and custom agents under `.github/prompts` and
  `.github/agents`.
- Claude Code skill docs define skill-only metadata such as `disable-model-invocation`,
  `user-invocable`, `allowed-tools`, and progressive disclosure.
- OpenAI prompt caching docs justify stable-prefix diagnostics, but Token Killer must not
  claim provider token savings from local context cleanup.

## RTK init prior art

RTK's Copilot init has two relevant behaviors to copy, with Token Killer's user-level scope
adjustment:

- It writes a hook config that points Copilot `PreToolUse` at `rtk hook copilot`. The hook
  only prefixes supported shell commands; the proxy handles compression.
- It also upserts a guarded marker block into `copilot-instructions.md`, telling the agent
  to prefix shell commands with `rtk`.
- It writes the instruction block **before** hook config, so malformed instructions abort the
  install without leaving a stale hook.
- It preserves user content outside the marker block, updates stale marker content
  idempotently, supports dry-run, and uninstall removes only RTK-managed content.
- It does not touch third-party hook files.

Token Killer follows the same pattern but changes defaults:

- RTK project-scopes Copilot files under `.github/`; Token Killer defaults to **user-level**
  writes and only writes project files under explicit `--project`.
- The managed instruction block says `tk <original command>`, not `rtk`, and uses the
  generic `## Token Budget` guidance below instead of a long command table.
- Hook/shim delivery is handled by `tk init`; context optimizer only manages restorable
  context/settings changes.

## Product stance

Good context reduces blind exploration. Bloated or conflicting context increases token
pressure and can reduce quality. The optimizer's job is to move each rule to the narrowest
surface that can still enforce it:

| Content type | Best surface |
|--------------|--------------|
| Project-wide invariant | `.github/copilot-instructions.md` or root `AGENTS.md` |
| Path/language/framework-specific rule | `.github/instructions/*.instructions.md` with `applyTo` |
| Repeatable task workflow | `.github/prompts/*.prompt.md` |
| Explicit persona + tool/model bundle | `.github/agents/*.agent.md` |
| Claude-only reusable procedure | `SKILL.md` with progressive disclosure |
| VS Code Copilot behavior toggle | user/workspace VS Code settings, usually advisory |
| Token budget behavior | Token Killer managed marker block |

Do not promise exact savings. Use "cost heuristic", "token pressure", "likely context
waste", and "cacheability risk".

## Copilot surface compatibility

The optimizer must classify advice by Copilot surface instead of treating all files as one
instruction blob:

| Surface | Supported context | Token Killer action |
|---------|-------------------|--------------------|
| VS Code Chat / Agent | `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`, `AGENTS.md`, `CLAUDE.md`, prompt files, custom agents, skills, VS Code settings | inspect all relevant surfaces; direct apply only user-level marker/settings; advice for restructuring |
| Copilot CLI | user/repo instructions, AGENTS-style files, hooks, custom agents depending on current CLI support | hook/shim delivery via `tk init`; context optimizer manages instruction blocks and advice |
| Copilot code review | custom instructions, but with a 4,000-character per-file read limit | `copilot_review_truncation`; advise moving review-critical rules before char 4,000 |
| Copilot cloud agent | repo/org instructions and custom agents, with feature support that differs from VS Code | adapter-specific advice; do not assume VS Code-only prompt/agent fields are supported |

Rule priority and conflict handling matter more than raw length. GitHub/VS Code can combine
multiple instruction layers in one request. Token Killer must flag duplicates and conflicts
between personal, path-specific, repo-wide, agent, and org instructions; it must not silently
choose a winner.

## Non-goals

- No runtime command compression; that remains `tk <command>` and shim/hook delivery.
- No automatic project file rewrites in default mode.
- No irreversible optimize action. Every direct modification must have a restore path.
- No source-code analysis beyond metadata needed to classify context files.
- No generation of new full `SKILL.md`, agent, or prompt files from scratch.
- No deletion of user instructions, even if duplicated.
- No exact token accounting or provider billing estimates.
- No adapter-specific field applied to the wrong ecosystem. Claude skill frontmatter is not
  a Copilot instruction feature.

## CLI contract

Static context findings come out of the **one** `tk inspect`. Two **orthogonal** flag axes
narrow it (ADR 0003):

- **Scope** (`--project` / `--user`) selects which static-context surfaces are read. The
  default — bare `tk inspect`, runnable anywhere — is **user-level**, because global context
  (`~/.claude/CLAUDE.md`, `~/.claude/skills`, `~/.copilot/copilot-instructions.md`) loads
  into *every* session and is the highest-leverage token cost. `--project` selects the
  current repo; pass both for both.
- **Analyzer type** (`--copilot-context`) narrows to static-context analyzers only. Runtime
  (session) analysis is orthogonal to scope and **always runs** unless `--copilot-context`
  turns it off.

The new command this goal owns is `tk optimize context` (the consumer).

```bash
tk inspect                              # default: USER-level static context + runtime
tk inspect --project                    # project static context + runtime
tk inspect --project --user             # both scopes + runtime
tk inspect --copilot-context            # narrow: static-context only (no runtime), user scope
tk inspect --project --copilot-context  # narrow: static-context only, project scope
tk inspect --surface instructions       # narrow further to one surface
tk inspect --surface prompts
tk inspect --surface agents
tk inspect --surface skills
tk inspect --json                       # unified Finding[] report
tk inspect --fail-on <severity>         # opt-in: exit 4 if findings at/above this severity exist

tk optimize context --dry-run           # read inspect findings → suggested diffs, no write
tk optimize context --apply-safe
tk optimize context --restore
tk optimize context --write-advice
tk optimize context --surface skills --dry-run
tk optimize context --vscode-settings --apply-safe
tk optimize context --token-budget-block --apply-safe
```

`--copilot-context` (static-only) is mutually exclusive with runtime-only flags
(`--since`, `--session`, `--input-type`): passing them together is an invalid-argument error
(exit 1), never a silent no-op. The scope flags (`--project` / `--user`) compose freely with
both axes.

Compatibility aliases:

```bash
tk skill scan
tk skill optimize --dry-run
tk agentsmd patch
tk agentsmd restore
```

Exit codes. `tk inspect` keeps the inspect-v1 table (ADR 0003); `--fail-on` adds an opt-in
code that does **not** reuse `2`. Findings never change the exit code on their own — inspect
is diagnostic, not enforcement.

`tk inspect`:

| Code | Meaning |
|------|---------|
| 0 | Report generated (including reports with warnings) |
| 1 | User input or configuration error |
| 2 | No major source analyzable — **runtime AND static context both empty** (not "session storage absent" alone) |
| 3 | Internal error |
| 4 | Findings at/above `--fail-on` severity exist (only when `--fail-on` is passed) |

`tk optimize context`:

| Code | Meaning |
|------|---------|
| 0 | Completed; no blocking errors |
| 1 | Invalid CLI arguments or unsafe apply request |
| 3 | Internal error |

## Data model

Add context optimizer types under `src/context/`. A static-context finding is the
`source = "static_context"` slice of inspect's unified `Finding` (DESIGN §9.0) — it does
**not** define its own report envelope. `ContextFinding` below is exactly that slice; the
analyzers emit it and inspect merges it into the one `Finding[]` report.

```ts
export type ContextSurface =
  | "copilot_instructions"
  | "path_instructions"
  | "agent_instructions"
  | "prompt_file"
  | "custom_agent"
  | "skill"
  | "vscode_settings"
  | "stable_prefix";

// Shared with runtime findings. "delivery" belongs to runtime findings (install shim/hook);
// static-context findings use direct_restorable, suggested_diff, advisory, and non_goal.
export type FixClass =
  | "direct_restorable"
  | "suggested_diff"
  | "advisory"
  | "delivery"
  | "non_goal";

export type FindingSeverity = "info" | "warn" | "error";

// The static_context view of inspect's Finding. id/severity/confidence/evidence/
// recommendation/fix_class are shared with runtime findings; surface/file/lines/adapter are
// the static-context locators. `source` is set to "static_context" when merged into inspect.
export type ContextFinding = {
  id: string;
  source: "static_context";
  type: ContextFindingType;
  severity: FindingSeverity;
  confidence: number;
  surface: ContextSurface;
  file?: string;
  start_line?: number;
  end_line?: number;
  evidence: string;
  recommendation: string;
  fix_class: FixClass;
  adapter?: "copilot" | "vscode" | "claude" | "gemini" | "codex" | "generic";
  scope?: "user" | "project"; // which scope produced it; drives report sectioning + bucket
};
```

These findings are written into the inspect report for their **scope bucket** (ADR 0003);
`tk optimize context` reads the matching bucket:

```text
~/.token-killer/user-context/inspect/latest.json               # user-scope unified Finding[] report
~/.token-killer/projects/<fingerprint>/inspect/latest.json     # project-scope unified Finding[] report
~/.token-killer/advice/context/user.md                         # optimize --write-advice (user scope)
~/.token-killer/advice/context/<fingerprint>.md                # optimize --write-advice (project scope)
```

Do not store raw instruction bodies by default. Store file path, line range, type, counts,
hash, and short evidence snippets only.

## Module layout

```text
src/context/
  analyzer.ts            # static-context analyzer registered into tk inspect (emits ContextFinding[])
  optimizeCli.ts         # `tk optimize context` consumer command (reads inspect findings)
  discover.ts            # find supported context files
  parseMarkdown.ts       # frontmatter + markdown section parsing
  metrics.ts             # chars, estimated tokens, headings, hashes, line maps
  report.ts              # static-context view formatting (within inspect's report)
  advice.ts              # user-level advice writer
  patchPlan.ts           # safe patch/suggested diff planning
  applySafe.ts           # marker/frontmatter safe writes only
  restore.ts             # restore managed marker blocks and settings/frontmatter backups
  vscodeSettings.ts      # locate/read/plan VS Code user/workspace settings changes
  rules/
    alwaysOn.ts
    pathInstructions.ts
    prompts.ts
    agents.ts
    skills.ts
    duplicates.ts
    conflicts.ts
    cacheability.ts
    vscodeSettings.ts
```

`src/context/` owns no `inspect` command. Instead it exposes a static-context **analyzer**
that `tk inspect` (`src/inspect/`) calls on every run (scope-aware: user-level by default,
project under `--project`), plus the `tk optimize context` consumer command. Keep the implementation independent from command
handlers. It may reuse `src/core/dataDir.ts` for storage and `src/core/savings.ts` for rough
token estimates, but it must not call the command pipeline. The optimize consumer reads
inspect's persisted `inspect/latest.json` for the relevant scope bucket (project bucket by
default; `--surface skills` user-level work reads the user bucket). When the bucket is
absent it triggers a full inspect run for that scope (`tk inspect --project`, or `--user`) —
it does not re-scan or re-rank on its own.

## Discovery

`src/context/discover.ts` scans a bounded set of paths, split by **scope** (ADR 0003).

User-level candidates — **the default scope** (bare `tk inspect`, or `--user`). Global
context loads into every session, so it is scanned by default and `tk inspect` is runnable
anywhere, including outside any repo:

```text
$HOME/.claude/CLAUDE.md
$HOME/.copilot/copilot-instructions.md
$COPILOT_CUSTOM_INSTRUCTIONS_DIRS/**/{AGENTS.md,.github/instructions/**/*.instructions.md}
$HOME/.claude/skills/*/SKILL.md
VS Code user settings.json for the active platform/profile
```

Project-level candidates — scanned only under `--project` (or `--project --user`), resolved
from `cwd`:

```text
.github/copilot-instructions.md
.github/instructions/**/*.instructions.md
.github/prompts/**/*.prompt.md
.github/agents/**/*.agent.md
AGENTS.md
**/AGENTS.md
CLAUDE.md
GEMINI.md
.claude/skills/*/SKILL.md
.vscode/settings.json
```

Persistence is split into two scope buckets so global findings are never duplicated across
projects or left stale (ADR 0003):

```text
~/.token-killer/user-context/inspect/latest.json        # user scope (no fingerprint)
~/.token-killer/projects/<fingerprint>/inspect/latest.json   # project scope
```

Runtime findings (orthogonal to scope) are written into whichever bucket(s) a run produces.
Project fingerprint: hash of git identity — the `git remote origin` URL when present, else
the `git` toplevel absolute path — falling back to a hash of the absolute `cwd` outside a git
repo. Only the hash is stored, never the raw path. Two clones of the same remote share one
report.

Boundaries:

- Never recurse through dependency, build, VCS, cache, or raw output directories:
  `node_modules`, `.git`, `dist`, `build`, `target`, `coverage`, `.next`,
  `.token-killer`.
- Cap discovery at 200 files by default; emit `discovery_truncated` if exceeded.
- `--repo-context` may include lightweight metadata from `README.md`, `package.json`, or
  `docs/`, but must not scan source files for code review.

## Parser

Use a structured parser, not regex-only slicing:

- Parse YAML frontmatter with a small dependency or a local conservative parser.
- Preserve byte offsets and line numbers for patch planning.
- Normalize headings, bullet text, markdown links, and fenced code blocks.
- Treat malformed frontmatter as a finding, not as a crash.

For markdown body metrics, compute:

- `char_count`
- `estimated_tokens` using the existing chars / 4 heuristic
- `line_count`
- `heading_count`
- `code_fence_count`
- `link_count`
- `body_hash`
- section-level hashes for duplicate detection

## Finding rules

### 1. `always_on_bloat`

Applies to:

- `.github/copilot-instructions.md`
- root `AGENTS.md`
- root `CLAUDE.md`
- root `GEMINI.md`
- `$HOME/.copilot/copilot-instructions.md`

Heuristics:

- warn when file > 250 lines or estimated tokens > 2,000
- warn when any single section > 800 estimated tokens
- warn when code fences contain examples longer than 80 lines
- warn when repeated task verbs dominate headings: `review`, `generate`, `migrate`,
  `release`, `deploy`, `triage`, `translate`

Recommendation:

- Keep always-on files for rules that are needed in almost every request.
- Move path-specific rules to `.github/instructions/*.instructions.md`.
- Move repeatable tasks to `.github/prompts/*.prompt.md`.
- Move explicit persona/tool bundles to `.github/agents/*.agent.md`.
- Remove or shorten "always be detailed", "always read external resources", and
  "always include full explanations" style instructions unless they are hard team rules.

Fix class: `suggested_diff` or `advisory`.

### 2. `conditional_rule_in_always_on`

Detect lines or sections that mention narrow path/language/framework scopes inside
always-on files:

- path globs: `src/**`, `docs/**`, `*.tsx`, `packages/foo`
- language names with local commands: `React`, `Django`, `Rails`, `Terraform`,
  `Kubernetes`, `Swift`
- phrases: "when editing", "for files under", "only in", "frontend", "backend"

Recommendation:

- Suggest a new or existing `.github/instructions/<name>.instructions.md` target with an
  `applyTo` glob.
- Examples: React rules belong in `frontend.instructions.md`; migration rules belong in
  `db-migrations.instructions.md`; they do not belong in repo-wide instructions.

Fix class: `suggested_diff`. Do not auto-create the new file.

### 3. `path_instruction_overbreadth`

Applies to `.github/instructions/**/*.instructions.md`.

Heuristics:

- `applyTo: "**"` or `**/*` with file-specific content
- missing `applyTo`
- multiple instruction files with overlapping broad globs and similar titles
- `excludeAgent` missing when the content is clearly unsuitable for code review or cloud
  agent, such as local-only commands or secrets-handling procedures

Recommendation:

- Narrow `applyTo`.
- Add `excludeAgent` only as a suggested diff, because it changes which Copilot surfaces
  see the rule.

Fix class: `suggested_diff`.

### 4. `task_prompt_in_instruction`

Detect repeatable workflow templates living in always-on instructions:

- numbered phases with an explicit user invocation shape
- placeholders like `<issue>`, `<ticket>`, `$ARGUMENTS`, `{target}`
- "Use this prompt", "When the user asks you to", "Template", "Checklist"

Recommendation:

- Move the workflow to `.github/prompts/<name>.prompt.md`.
- Keep only a one-line route in always-on instructions if needed.
- Examples: code review, test generation, migration planning, README generation, release
  notes, and PR descriptions are task templates, not always-on instructions.

Fix class: `advisory` by default. Generating a prompt file changes workflow semantics.

### 5. `prompt_metadata_gap`

Applies to `.github/prompts/**/*.prompt.md`.

Heuristics:

- missing `description`
- missing `argument-hint` when body contains placeholders
- broad `tools` list when the prompt is read-only
- prompt body duplicates always-on instructions instead of referencing them

Recommendation:

- Add metadata as suggested diff.
- Prefer minimal tool list for prompt files, because VS Code gives prompt-file tools
  priority over custom-agent/default tools.

Fix class:

- `direct_restorable` only for adding missing `description` inferred from file name when
  `--apply-safe --surface prompts` is explicitly used.
- otherwise `suggested_diff`.

### 6. `agent_overbreadth`

Applies to `.github/agents/**/*.agent.md`.

Heuristics:

- agent name/description is generic: `developer`, `helper`, `assistant`
- tools include broad write/edit/terminal access for a read-only persona
- prompt repeats repo-wide instructions
- model is set to an expensive model for a routine workflow
- agent has no clear trigger or task boundary

Recommendation:

- Make the agent explicit: one persona, one workflow family, narrow tools.
- Move task templates to prompt files if the agent only wraps a single prompt.
- Use custom agents for long-lived specialized roles that need tool restrictions, model
  preference, handoffs, or a distinct persona; do not emulate those roles with always-on
  instructions.

Fix class: `advisory`.

### 7. `skill_invocation_policy`

Applies only to Claude-compatible skills.

Heuristics:

- side-effect verbs in name/body without `disable-model-invocation: true`:
  `commit`, `push`, `deploy`, `publish`, `release`, `send`, `delete`, `archive`
- background knowledge skill with `user-invocable` unset and no meaningful slash-command
  action
- `allowed-tools` absent for clearly read-only skills
- `paths` absent for path-specific project skills

Recommendation:

- Add `disable-model-invocation: true` for side-effect or high-cost workflows.
- Add `user-invocable: false` for background knowledge.
- Add `allowed-tools` for least-privilege read-only skills.

Fix class:

- `suggested_diff` by default.
- `direct_restorable` only for user-level skills when the rule has high confidence and
  `--apply-safe --surface skills` is explicit.

### 8. `skill_entrypoint_bloat`

Applies to `SKILL.md`.

Heuristics:

- > 500 lines
- long examples or API references inline
- large code fences
- repeated full templates in the entrypoint

Recommendation:

- Move details to `references/`, `examples/`, `templates/`, or `scripts/`.
- Keep `SKILL.md` as overview + route map.

Fix class: `advisory`; extracting files is semantic.

### 9. `instruction_duplicate`

Detect near-duplicate sections across context surfaces:

- exact section hash match
- normalized text similarity above 0.92
- same heading and similar bullet list

Recommendation:

- Keep the rule in the narrowest durable surface.
- Replace duplicates with a short route/reference only when the target surface reliably
  loads that reference.
- Treat root `AGENTS.md` as routing guidance: what to read, what to run, and what to avoid.
  It should not copy README, ADRs, full test strategy, or review checklists verbatim.

Fix class: `advisory` or `suggested_diff`. Never delete automatically.

### 10. `instruction_conflict`

Detect contradictory directives with small curated rule families:

- language/tone: "reply in Chinese" vs "reply in English"
- testing: "always run full test suite" vs "run targeted tests first"
- edits: "commit automatically" vs "never commit without approval"
- context: "read full files" vs "read only focused ranges"
- model/tool: "use all tools" vs "read-only plan"

Recommendation:

- Report both file locations and the higher-priority surface when known.
- Ask the user/team to choose the canonical rule.
- Prefer a conflict finding over a compression finding when the same content is both long
  and contradictory. A shorter contradiction is still harmful.

Fix class: `advisory`.

### 11. `copilot_review_truncation`

Applies to any instruction file that Copilot code review may read.

Heuristics:

- file > 4,000 characters
- review-specific rule starts after char 4,000
- long preamble pushes concrete review rules below the limit

Recommendation:

- Move review-critical rules into the first 4,000 characters.
- Use path-specific instructions when review rules only apply to certain files.
- If the first 4,000 characters are preamble and the concrete review rules come later,
  report this as ineffective for Copilot code review even if VS Code Chat can still see it.

Fix class: `suggested_diff`. Do not auto-reorder.

### 12. `cacheability_churn`

Applies to stable prompt/instruction surfaces and generated advice.

Heuristics:

- timestamps, dates, run IDs, temp paths, absolute local session paths
- generated telemetry IDs
- latest command output embedded into stable instructions
- unstable heading names or random ordering in generated files

Recommendation:

- Move volatile content to advice/history.
- Use stable headings and canonical ordering.

Fix class: `suggested_diff` for Token Killer managed files, `advisory` for project files.

### 13. `vscode_terminal_compression_disabled`

Applies to VS Code user/workspace settings.

Heuristic:

- `chat.tools.compressOutput.enabled` is absent or not `true`

Recommendation:

- Set user-level `chat.tools.compressOutput.enabled: true`. VS Code documents this setting as
  compressing large terminal output before sending it to the model to reduce context window
  usage.

Fix class:

- `direct_restorable` for user-level VS Code settings.
- `suggested_diff` for workspace settings.

### 14. `vscode_context_surface_risk`

Applies to VS Code user/workspace settings.

Heuristics:

- `chat.includeReferencedInstructions: true`
- `chat.useNestedAgentsMdFiles: true`
- `chat.useCustomizationsInParentRepositories: true`
- `github.copilot.chat.additionalReadAccessFolders` is non-empty
- `chat.mcp.discovery.enabled: true`
- `github.copilot.chat.codesearch.enabled: true`
- `github.copilot.chat.edits.suggestRelatedFilesFromGitHistory: true`
- `chat.sendElementsToChat.attachCSS: true` or `chat.sendElementsToChat.attachImages: true`

Recommendation:

- Explain which context surface may expand and when it is worth keeping enabled. Do not
  auto-disable these settings; they encode workflow preferences.

Fix class: `advisory`.

### 15. `vscode_agent_budget_risk`

Applies to VS Code user/workspace settings.

Heuristics:

- `chat.agent.maxRequests > 15`
- `github.copilot.chat.agent.autoFix: true` in strict token-control mode
- broad MCP/tool settings that allow extra autonomous tool use

Recommendation:

- Suggest a lower request budget, typically 8-12 for token-control profiles.
- Keep this advisory because it can reduce complex-task success.

Fix class: `advisory`.

## Patch planning

`src/context/patchPlan.ts` emits a plan, never applies directly:

```ts
export type ContextPatchPlan = {
  target: string;
  fix_class: FixClass;
  operations: ContextPatchOperation[];
  requires_confirmation: boolean;
  reason: string;
};

export type ContextPatchOperation =
  | { kind: "insert_marker_block"; path: string; marker: "token_killer" }
  | { kind: "remove_marker_block"; path: string; marker: "token_killer" }
  | { kind: "frontmatter_set"; path: string; key: string; value: unknown }
  | { kind: "vscode_setting_set"; path: string; key: string; value: unknown }
  | { kind: "suggested_diff"; path: string; diff: string };
```

Only `insert_marker_block`, `remove_marker_block`, explicit high-confidence user-level
`frontmatter_set`, and user-level `vscode_setting_set` for
`chat.tools.compressOutput.enabled: true` are eligible for direct apply.

## Direct apply and restore rules

`src/context/applySafe.ts` may write only when all conditions hold:

- operation has `fix_class === "direct_restorable"`
- a backup is written under `~/.token-killer/backups/context/<timestamp>/`
- the patch can be reversed
- the generated diff is printed

Allowed direct modifications:

| Direct operation | Default target | Restore behavior |
|------------------|----------------|------------------|
| Insert Token Killer `tk <command>` / Token Budget marker block | user-level AGENTS/copilot-instructions target | remove only the marker block |
| Insert project marker block | only with explicit `--project` | remove only the marker block |
| Add high-confidence skill invocation frontmatter | user-level skill and explicit `--surface skills` | restore backed-up original file |
| Set `chat.tools.compressOutput.enabled: true` | VS Code user settings | restore original value, or delete key if absent before apply |

Project semantic rewrites are never direct modifications. For project files, `--dry-run`
prints a diff and `--write-advice` writes an advice artifact.

## Advice format

Write Markdown advice to:

```text
~/.token-killer/advice/context/<project_fingerprint>.md
```

Shape:

```markdown
# Copilot Context Advice

Project: repo:<hash>
Generated: <ISO timestamp>
Files scanned: <n>

## Findings

### [warn] always_on_bloat
- Surface: copilot_instructions
- File: .github/copilot-instructions.md
- Evidence: 3,200 estimated tokens; contains two task workflows
- Recommendation: Move repeatable review workflow to .github/prompts/review.prompt.md.
- Fix class: suggested_diff

## Safe applies available

- Run `tk optimize context --token-budget-block --apply-safe` to install the managed token
  budget block in your user-level agent instructions.
- Run `tk optimize context --vscode-settings --apply-safe` to enable VS Code terminal output
  compression in user settings.
```

## Report format

The static-context findings render as a section within `tk inspect`'s unified report
(not a standalone "Copilot Context Inspect" document). Default text groups by severity and
fix class:

```text
Static context  (source = static_context)
Files scanned: 8
Findings: 6 (warn 4, info 2)

[warn] always_on_bloat .github/copilot-instructions.md:1
  Evidence: 2,700 estimated tokens; contains deploy workflow and test-generation template.
  Recommendation: Move repeatable workflows to .github/prompts/.
  Fix: suggested_diff

[info] skill_invocation_policy ~/.claude/skills/deploy/SKILL.md:1
  Evidence: side-effect workflow lacks disable-model-invocation.
  Recommendation: Add disable-model-invocation: true.
  Fix: direct_restorable

[info] vscode_terminal_compression_disabled ~/Library/Application Support/Code/User/settings.json
  Evidence: chat.tools.compressOutput.enabled is absent.
  Recommendation: Set chat.tools.compressOutput.enabled to true in user settings.
  Fix: direct_restorable
```

JSON output is inspect's unified `Finding[]` report (DESIGN §9.0); static-context findings
are the entries with `source = "static_context"`.

## Remaining implementation work

The baseline already has static-context discovery, parsing, metrics, report rendering,
several finding rules, dry-run/advice output, and the first direct-apply path. Do not rebuild
those pieces. Continue from the current code by tightening the contract below.

### Work item 1 — Rename legacy safe-apply semantics

Current code still uses the old `safe_mechanical` fix class and `tk:token_budget` marker.
Migrate it to the design contract:

- Rename `safe_mechanical` to `direct_restorable` in context types, rule outputs, tests,
  report text, patch planning, and apply filtering.
- Rename marker constants to:
  - start: `<!-- token-killer:start -->`
  - end: `<!-- token-killer:end -->`
- Support restore of legacy `<!-- tk:token_budget:* -->` blocks for one release, but new
  writes must only emit the Token Killer marker.
- Update the managed block text to the exact `## Token Budget` block in this goal.

Tests:

- existing legacy marker can be removed by restore
- insert writes only `token-killer:*` markers
- repeated insert is idempotent and replaces stale Token Killer marker content
- no code path still emits `safe_mechanical`

### Work item 2 — Make optimizer interactive by default for mixed actions

`tk optimize context` can become an interactive consumer because many findings are advice,
not safe edits. The non-interactive flags remain available for automation.

CLI behavior:

```bash
tk optimize context                 # interactive TTY flow when stdout is a TTY
tk optimize context --dry-run        # non-interactive plan only
tk optimize context --apply-safe     # non-interactive direct-restorable apply only
tk optimize context --yes            # accept all direct_restorable actions; never applies advisory actions
tk optimize context --restore        # interactive restore picker unless --all or --action-id is passed
```

Interactive flow:

1. Load or trigger inspect for the selected scope.
2. Group findings into:
   - `Direct and restorable`
   - `Suggested diffs`
   - `Advice only`
   - `Not applicable / stale`
3. Show each direct action with target path, exact diff summary, restore method, and risk.
4. Let the user choose:
   - apply this
   - skip this
   - show full diff
   - write advice instead
   - quit without writing
5. Apply only selected `direct_restorable` actions.
6. Print restore commands and action ids after writes.

Non-TTY behavior:

- Without `--dry-run`, `--apply-safe`, `--write-advice`, `--restore`, or `--yes`, fail with a
  short message telling the caller to choose a non-interactive mode.
- Never prompt in CI.

Tests:

- TTY interactive flow can apply one selected action and skip another
- non-TTY bare command fails without writing
- `--yes` applies only `direct_restorable` operations
- advisory and suggested-diff findings are never applied by `--yes`

### Work item 3 — Direct-restorable action ledger and restore

Direct modification must be restorable even when more than one file changes.

Implement an action manifest under:

```text
~/.token-killer/optimize/actions/<action_id>.json
```

Manifest fields:

```ts
type OptimizeActionManifest = {
  id: string;
  created_at: string;
  scope: "user" | "project";
  command: string[];
  operations: Array<{
    kind: "marker_block" | "frontmatter" | "vscode_setting";
    target: string;
    before_hash: string | null;
    after_hash: string;
    backup_path?: string;
    restore: "remove_marker" | "restore_backup" | "restore_vscode_setting";
    original_setting_value?: unknown;
    original_setting_existed?: boolean;
  }>;
};
```

Restore behavior:

- `tk optimize context --restore --action-id <id>` restores one action.
- `tk optimize context --restore --all` restores all Token Killer context optimizer actions in
  reverse chronological order.
- Bare `--restore` on a TTY opens an action picker.
- Marker restore removes only the Token Killer marker block.
- VS Code setting restore restores the old value, or deletes the key when it did not exist.
- Backup restore must verify the current file hash before overwriting; if changed, refuse and
  print the backup path.

Tests:

- action manifest is written after successful apply
- failed operation does not leave a manifest claiming success
- restore is idempotent
- restore refuses hash-mismatched backup overwrite

### Work item 4 — VS Code settings direct action plus advisory rules

Add a VS Code settings adapter without turning it into a broad settings mutator.

Direct action:

- User settings only: set `chat.tools.compressOutput.enabled` to `true`.
- Preserve JSONC comments and formatting when possible; otherwise use a stable JSONC writer.
- Store original value/existence in the action manifest.

Advisory-only findings:

- `chat.includeReferencedInstructions`
- `chat.useNestedAgentsMdFiles`
- `chat.useCustomizationsInParentRepositories`
- `github.copilot.chat.additionalReadAccessFolders`
- `chat.mcp.discovery.enabled`
- `github.copilot.chat.codesearch.enabled`
- `github.copilot.chat.edits.suggestRelatedFilesFromGitHistory`
- `chat.agent.maxRequests`
- `github.copilot.chat.agent.autoFix`

Tests:

- user setting absent → direct_restorable finding and apply
- user setting false → direct_restorable finding and apply
- workspace setting false/absent → suggested diff only
- broad context settings produce advisory findings only

### Work item 5 — Skill invocation frontmatter direct action

Keep this narrower than the scan findings.

Direct action eligibility:

- scope is user
- surface is `skill`
- finding type is `skill_invocation_policy`
- confidence is high
- operation only adds or updates one known frontmatter key
- `--surface skills` is explicit, or the interactive picker selected that action

Suggested keys:

- side-effect workflow: `disable-model-invocation: true`
- background-only knowledge: `user-invocable: false`
- read-only skill: narrow `allowed-tools`

Do not auto-apply project skills. Do not apply Claude-only frontmatter to Copilot prompts,
agents, or instructions.

### Work item 6 — Project marker writes require explicit scope and interaction

Default writes stay user-level. Project marker writes are allowed only when all are true:

- `--project` is passed
- operation is the Token Killer marker block
- command is interactive and the user selects the action, or non-interactive mode passes
  `--apply-safe --project --yes`
- target file is `.github/copilot-instructions.md` or root `AGENTS.md`

Project semantic rewrites remain suggested diff/advice only.

### Work item 7 — Verification commands

Use focused verification while this is in progress:

```bash
pnpm test:product -- context
pnpm test:product -- inspect
pnpm test:validate-docs
pnpm typecheck
```

## Acceptance criteria

- `tk inspect` (default-full) includes static-context findings; `tk inspect --copilot-context`
  narrows to them. Both are fully read-only.
- All static-context findings carry `source = "static_context"`, file, evidence,
  recommendation, and `fix_class`, merged into inspect's unified report.
- `tk optimize context` consumes inspect's persisted report (or triggers inspect when absent).
- `tk optimize context --dry-run` never writes.
- `tk optimize context --write-advice` writes only user-level advice.
- `tk optimize context --apply-safe` refuses project-level semantic edits.
- Token Killer managed marker block is idempotent and restorable.
- Direct VS Code settings writes are idempotent and restorable.
- Claude-only skill metadata never appears as a Copilot recommendation.
- The implementation does not scan source files for code review.
- Tests cover healthy and unhealthy examples for every finding type.

## Risk controls

| Risk | Control |
|------|---------|
| Optimizer rewrites team workflow incorrectly | default project behavior is suggested diff/advice only |
| Advice implies exact billing savings | wording restricted to heuristics/token pressure |
| Copilot surface support changes | adapter labels and source notes stay in findings |
| Duplicate detection deletes useful local nuance | no automatic deletes |
| Skill frontmatter breaks shared project skills | project skills are never safe-applied |
| VS Code settings changes alter user workflow | only terminal compression is direct-applied by default; other settings are advisory |
| Prompt cache claims are overstated | report cacheability risk only, never provider savings |
