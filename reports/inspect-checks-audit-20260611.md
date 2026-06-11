# inspect checks — correctness audit (2026-06-11)

Reverse-reviewed every inspect check (static-context rules + runtime advice), new
and pre-existing, for false positives (telling the user something wrong) and false
negatives (missing a real issue). Verdict + action per check below. Two confirmed
FPs were fixed in commit 68b584d; the rest are recorded with severity.

Legend: **FP** false-positive risk · **FN** false-negative risk · ✅ fixed · 📝 noted.

## Static-context rules

| Check | Finding | Verdict |
|---|---|---|
| `skill_invocation_policy` | **FP (high), ✅ fixed**: matched side-effect verbs anywhere in the BODY → flagged read/think/learn (read-only) as side-effect. Now classifies on name+description (the routing surface). Verified `learn` no longer fires on "publish-ready"; genuine side-effect skills (verb in description) still fire. | fixed |
| `path_instruction_overbreadth` | **FP (med), ✅ fixed**: REVIEW_UNSAFE matched bare `token`/`local` as secrets (false in token-killer: "token budget", "local dev"). Tightened to secrets-bearing phrases. | fixed |
| `always_on_bloat` | 📝 lowered to 200 lines (150 AGENTS.md). Slightly more files in 200–250 now fire — intended (research-backed), severity warn/advisory, reversible. Low FP. | noted |
| `output_verbosity_unset` (new) | 📝 **FP-ish (noise)**: fires on nearly every always-on instruction file (most lack a brevity directive). Valid but near-universal; info severity, one per file. Acceptable; could gate on file size later. | noted |
| `cacheability_churn` | 📝 **FP (low-med)**: bare-date pattern `\d{4}-\d{2}-\d{2}` flags any date (a changelog line). It IS a cacheability signal; info severity. Acceptable. | noted |
| `conditional_rule_in_always_on` | 📝 PATH_GLOB/PHRASE can match incidental `*.ts`/"frontend". Conservative enough (warn 0.6). | noted |
| `task_prompt_in_instruction` | 📝 "checklist"/"template" keyword can over-match; info 0.6. | noted |
| `prompt_metadata_gap`, `agent_overbreadth`, `copilot_review_truncation` | low FP; bounded keyword sets, info/warn. | noted |
| `instruction_duplicate` / `instruction_conflict` | cross-file, conservative (same-heading near-dup; curated conflict families). Low FP/FN. | noted |
| `skill_entrypoint_bloat` / `skill_description_bloat` / `skill_count_bloat` (new) | calibrated against the real 26-skill machine; fire correctly. **Depended on the symlink discovery fix (commit 2bf6853)** — without it 18/26 skills were invisible (the real FN). | ok |

## Runtime advice (src/inspect/advice.ts)

| Check | Finding | Verdict |
|---|---|---|
| `delivery` / `shell-noise` / `tool-noise` | compressible/governed signals; sound. | ok |
| `skill-gap` (reads≥6) · `context-gap` (searches≥6) · `cost-tip` orientation (reads+searches+lists≥12) | 📝 **redundancy (noise)**: a heavy session trips all three. They give DISTINCT fixes (reusable skill / durable CONTEXT.md / code-intelligence), so kept — but worth merging or making mutually-exclusive if users find it noisy. | noted |
| `cost-tip` long-loops / prompts / failures | thresholds heuristic (avg≥20 tool calls, long_prompt≥3, failure≥3); defensible, not validated against a labelled baseline. | noted |
| `mcp-bloat` (new) | 📝 **FN (minor, intentional)**: counts top-level `mcpServers` only, NOT `~/.claude.json` `projects[].mcpServers` (project-scoped servers load only in their repo, so excluding them from the always-on count is correct). | noted (by design) |
| `storage-discovery` | fires only when sessions found but 0 events read — the honest "couldn't read" case. Sound. | ok |

## Cross-cutting honesty fixes (separate commit ebdee06)

Several **impact percentages** in recommendations came from community blog posts (via
the research subagent), not primary sources, but were stated as fact (40-70%, 91.9%,
31×, 72%, 17×, 90%/58%). All softened to attributed/"reported" wording. tk's own
COMPUTED numbers (token estimates, counts) are real and unchanged.

## Not audited / out of scope

Thresholds are heuristics, not validated against a labelled corpus — a proper
precision/recall pass would need a tagged dataset of real sessions/configs, which we
don't have. The model/cache/thinking checks are deferred (data absent — see
token-optimization-best-practices report).
