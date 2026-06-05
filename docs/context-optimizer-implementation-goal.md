# Goal: Ship Copilot Context Optimizer inspect + optimize

Drive agent sessions that build Token Guard's static context optimizer for GitHub Copilot
workflows. This is not command-output compression. It diagnoses and improves the files that
Copilot, VS Code, Claude, Gemini, and Codex may load as instructions, prompts, agents, or
skills.

**Architecture (locked — read this first).** There is exactly **one `tg inspect`** (DESIGN
§9), and it **runs all analyzers by default** — runtime (prompt/session/tool/input/output)
*and* static context. The static context analysis this goal builds is **a set of analyzers
inside that one inspect**, contributing `source = static_context` findings to the unified
report. It is **NOT** a separate `tg inspect --copilot-context` scan command;
`--copilot-context`/`--surface` are only narrowing flags. The "context optimizer" is the
**downstream consumer** `tg optimize context`: it reads inspect's findings and makes
targeted modifications.

The product shape is two-stage:

1. **Inspect** (the one `tg inspect`, DESIGN §9): read-only; static-context analyzers
   produce findings with evidence, severity, surface, confidence, and an explicit
   `fix_class`, merged into inspect's unified `Finding[]` report.
2. **Optimize** (`tg optimize context`): consumes inspect's `source = static_context`
   findings, applies only safe mechanical changes, and generates suggested diffs or advice
   for everything that requires semantic or team workflow judgment. It first reads the
   persisted inspect report (`~/.token-guard/projects/<fingerprint>/inspect/latest.json`);
   if absent it triggers an inspect run.

## Source of truth

- `docs/DESIGN.md` §4 and §5 define the product boundary.
- `docs/inspect-v1-design.md` defines the inspect posture: no source-code analysis, no
  exact token accounting, no project-level writes.
- GitHub Copilot custom instruction docs define the supported Copilot surfaces:
  `.github/copilot-instructions.md`, `.github/instructions/**/*.instructions.md`,
  `AGENTS.md`, `CLAUDE.md`, and `GEMINI.md`.
- VS Code docs define prompt files and custom agents under `.github/prompts` and
  `.github/agents`.
- Claude Code skill docs define skill-only metadata such as `disable-model-invocation`,
  `user-invocable`, `allowed-tools`, and progressive disclosure.
- OpenAI prompt caching docs justify stable-prefix diagnostics, but Token Guard must not
  claim provider token savings from local context cleanup.

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
| Token budget behavior | Token Guard managed marker block |

Do not promise exact savings. Use "cost heuristic", "token pressure", "likely context
waste", and "cacheability risk".

## Non-goals

- No runtime command compression; that remains `tg <command>` and shim/hook delivery.
- No automatic project file rewrites in default mode.
- No source-code analysis beyond metadata needed to classify context files.
- No generation of new full `SKILL.md`, agent, or prompt files from scratch.
- No deletion of user instructions, even if duplicated.
- No exact token accounting or provider billing estimates.
- No adapter-specific field applied to the wrong ecosystem. Claude skill frontmatter is not
  a Copilot instruction feature.

## CLI contract

Static context findings come out of the **one** `tg inspect` (default-full). The flags below
only **narrow** which analyzers run; with no flag, `tg inspect` already includes static
context. The new command this goal owns is `tg optimize context` (the consumer).

```bash
tg inspect                              # default: runs ALL analyzers incl. static context
tg inspect --copilot-context            # narrow: static-context analyzers only
tg inspect --surface instructions       # narrow further to one surface
tg inspect --surface prompts
tg inspect --surface agents
tg inspect --surface skills
tg inspect --json                       # unified Finding[] report

tg optimize context --dry-run           # read inspect findings → suggested diffs, no write
tg optimize context --apply-safe
tg optimize context --write-advice
tg optimize context --surface skills --dry-run
tg optimize context --token-budget-block --apply-safe
```

Compatibility aliases:

```bash
tg skill scan
tg skill optimize --dry-run
tg agentsmd patch
tg agentsmd restore
```

Exit codes:

| Code | Meaning |
|------|---------|
| 0 | Completed; no blocking errors |
| 1 | Invalid CLI arguments or unsafe apply request |
| 2 | Findings exist above configured threshold, when `--fail-on` is used |

## Data model

Add context optimizer types under `src/context/`.

```ts
export type ContextSurface =
  | "copilot_instructions"
  | "path_instructions"
  | "agent_instructions"
  | "prompt_file"
  | "custom_agent"
  | "skill"
  | "stable_prefix";

export type FixClass = "safe_mechanical" | "suggested_diff" | "advisory" | "non_goal";

export type FindingSeverity = "info" | "warn" | "error";

export type ContextFinding = {
  id: string;
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
};

export type ContextInspectReport = {
  version: 1;
  cwd: string;
  project_fingerprint: string;
  generated_at: string;
  files_scanned: number;
  findings: ContextFinding[];
};
```

Persist reports only when explicitly requested:

```text
~/.token-guard/projects/<fingerprint>/context-inspect/latest.json
~/.token-guard/projects/<fingerprint>/context-inspect/<timestamp>.json
~/.token-guard/advice/context/<fingerprint>.md
```

Do not store raw instruction bodies by default. Store file path, line range, type, counts,
hash, and short evidence snippets only.

## Module layout

```text
src/context/
  cli.ts                 # inspect/optimize command dispatch
  discover.ts            # find supported context files
  parseMarkdown.ts       # frontmatter + markdown section parsing
  metrics.ts             # chars, estimated tokens, headings, hashes, line maps
  report.ts              # text/json report formatting
  advice.ts              # user-level advice writer
  patchPlan.ts           # safe patch/suggested diff planning
  applySafe.ts           # marker/frontmatter safe writes only
  rules/
    alwaysOn.ts
    pathInstructions.ts
    prompts.ts
    agents.ts
    skills.ts
    duplicates.ts
    conflicts.ts
    cacheability.ts
```

Keep the implementation independent from command handlers. It may reuse
`src/core/dataDir.ts` for storage and `src/core/savings.ts` for rough token estimates, but
it must not call the command pipeline.

## Discovery

`src/context/discover.ts` scans a bounded set of paths from `cwd` and user-level locations.

Project-level candidates:

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
```

User-level candidates:

```text
$HOME/.copilot/copilot-instructions.md
$COPILOT_CUSTOM_INSTRUCTIONS_DIRS/**/{AGENTS.md,.github/instructions/**/*.instructions.md}
$HOME/.claude/skills/*/SKILL.md
```

Boundaries:

- Never recurse through dependency, build, VCS, cache, or raw output directories:
  `node_modules`, `.git`, `dist`, `build`, `target`, `coverage`, `.next`,
  `.token-guard`.
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

- Move path-specific rules to `.github/instructions/*.instructions.md`.
- Move repeatable tasks to `.github/prompts/*.prompt.md`.
- Move explicit persona/tool bundles to `.github/agents/*.agent.md`.

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

- `safe_mechanical` only for adding missing `description` inferred from file name when
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
- `safe_mechanical` only for user-level skills when the rule has high confidence and
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

Fix class: `suggested_diff` for Token Guard managed files, `advisory` for project files.

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
  | { kind: "insert_marker_block"; path: string; marker: "token_budget" }
  | { kind: "remove_marker_block"; path: string; marker: "token_budget" }
  | { kind: "frontmatter_set"; path: string; key: string; value: unknown }
  | { kind: "suggested_diff"; path: string; diff: string };
```

Only `insert_marker_block`, `remove_marker_block`, and explicit high-confidence
user-level `frontmatter_set` are eligible for `applySafe`.

## Safe apply rules

`src/context/applySafe.ts` may write only when all conditions hold:

- target is user-level, or target is a Token Guard managed marker block
- operation has `fix_class === "safe_mechanical"`
- a backup is written under `~/.token-guard/backups/context/<timestamp>/`
- the patch can be reversed
- the generated diff is printed

Project files in the current repo are never modified by default. For project files,
`--dry-run` prints a diff and `--write-advice` writes an advice artifact.

## Advice format

Write Markdown advice to:

```text
~/.token-guard/advice/context/<project_fingerprint>.md
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

- Run `tg optimize context --token-budget-block --apply-safe` to install the managed token
  budget block in your user-level agent instructions.
```

## Report format

Default text output should group by severity and fix class:

```text
Copilot Context Inspect
Files scanned: 8
Findings: 6 (warn 4, info 2)

[warn] always_on_bloat .github/copilot-instructions.md:1
  Evidence: 2,700 estimated tokens; contains deploy workflow and test-generation template.
  Recommendation: Move repeatable workflows to .github/prompts/.
  Fix: suggested_diff

[info] skill_invocation_policy ~/.claude/skills/deploy/SKILL.md:1
  Evidence: side-effect workflow lacks disable-model-invocation.
  Recommendation: Add disable-model-invocation: true.
  Fix: suggested_diff
```

JSON output is the `ContextInspectReport` model.

## Implementation slices

### Slice 1 — Discovery + parser + report shell

Deliver:

- `src/context/discover.ts`
- `src/context/parseMarkdown.ts`
- `src/context/metrics.ts`
- `src/context/report.ts`
- CLI entry for `tg inspect --copilot-context`

Tests:

- discovers supported project/user files
- skips dependency/build/cache dirs
- parses frontmatter and malformed frontmatter
- line ranges remain stable
- text and JSON report render

Verification:

```bash
pnpm test:product -- context
pnpm typecheck
```

### Slice 2 — Low-risk finding rules

Deliver:

- `always_on_bloat`
- `path_instruction_overbreadth`
- `prompt_metadata_gap`
- `copilot_review_truncation`
- `cacheability_churn`

Tests:

- fixture files for each supported surface
- no finding for compact healthy examples
- no crashes on malformed markdown

Verification:

```bash
pnpm test:product -- context
pnpm typecheck
```

### Slice 3 — Duplicate/conflict/task-surface rules

Deliver:

- `instruction_duplicate`
- `instruction_conflict`
- `conditional_rule_in_always_on`
- `task_prompt_in_instruction`
- `agent_overbreadth`

Tests:

- exact duplicates and near duplicates
- curated conflict families
- task workflows suggested as prompt files
- no broad source-code scan

Verification:

```bash
pnpm test:product -- context
pnpm test:validate-docs
```

### Slice 4 — Skill adapter

Deliver:

- Claude skill parser support
- `skill_invocation_policy`
- `skill_entrypoint_bloat`
- adapter labels so Claude-only fields are not treated as Copilot features

Tests:

- side-effect skill recommends `disable-model-invocation`
- background knowledge skill recommends `user-invocable: false`
- long entrypoint recommends progressive disclosure
- project skill remains suggested/advisory only

Verification:

```bash
pnpm test:product -- context
pnpm typecheck
```

### Slice 5 — Optimize dry-run + advice writer

Deliver:

- `tg optimize context --dry-run`
- `tg optimize context --write-advice`
- `src/context/patchPlan.ts`
- `src/context/advice.ts`

Tests:

- suggested diff includes line ranges and does not write files
- advice file writes under `~/.token-guard/advice/context/`
- no raw instruction body persisted

Verification:

```bash
TOKEN_GUARD_HOME="$(mktemp -d)" pnpm test:product -- context
pnpm typecheck
```

### Slice 6 — Safe apply + restore

Deliver:

- `tg optimize context --apply-safe`
- `tg optimize context --token-budget-block --apply-safe`
- `tg agentsmd patch`
- `tg agentsmd restore`
- user-level backups

Allowed writes:

- `$HOME/.copilot/copilot-instructions.md` Token Guard marker block
- user-level `AGENTS.md` only when explicitly configured as a user instruction target
- user-level Claude skills only for high-confidence frontmatter changes and explicit
  `--surface skills`

Tests:

- marker insertion is idempotent
- restore removes only Token Guard marker block
- backup is created before write
- project-level file refuses `--apply-safe`
- frontmatter change preserves body and comments

Verification:

```bash
TOKEN_GUARD_HOME="$(mktemp -d)" pnpm test:product -- context
pnpm test:validate-docs
pnpm typecheck
```

## Acceptance criteria

- `tg inspect --copilot-context` is fully read-only.
- All findings include file, evidence, recommendation, and `fix_class`.
- `tg optimize context --dry-run` never writes.
- `tg optimize context --write-advice` writes only user-level advice.
- `tg optimize context --apply-safe` refuses project-level semantic edits.
- Token Guard managed marker block is idempotent and restorable.
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
| Prompt cache claims are overstated | report cacheability risk only, never provider savings |

