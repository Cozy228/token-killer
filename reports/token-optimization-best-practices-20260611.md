# Token / cost optimization best practices — research (2026-06-11)

Compiled by a research sub-agent from Anthropic docs, GitHub Copilot docs, Augment
Code, ProjectDiscovery, and practitioner writeups. Intended to ground tk's inspect
cost-tips and context/skill analyzers in cited, quantified practices.

## Most relevant to tk (detectable from the data tk already has)

| Practice | Detect signal | Threshold | Impact | Source |
|---|---|---|---|---|
| Session too long / continuation depth | tool calls or turns per session | ≥ ~15–20 | turn 30 ≈ 31× turn 1; 20-step loop ≈ 210k cumulative input tokens | dev.to Token Optimisation 101; Augment Code |
| Oversized prompts | user prompt length | > ~2000 chars | re-sent every turn | Claude Code best-practices |
| CLAUDE.md bloat | always-on file lines/tokens | > 200 lines / ~2000 tok | 3847→312 tok = 91.9% cut; ×30 msgs = 60k tok | code.claude.com/costs; branch8 |
| AGENTS.md too long | lines | > 100–150 | gains reverse past ~150 lines | augmentcode AGENTS.md guide |
| Missing "code only" directive | instructions lack output-brevity rule | absent | 40–70% OUTPUT token cut (output is 4× input price) | github/copilot-token-optimization |
| Too many user skills | count of user-scope skills | > ~20 | each skill's name+desc loads every session | (tk skill_count_bloat) |
| Skill description bloat | skill `description` length | > ~600 chars | always-on invocation metadata | DESIGN §4.2 |
| Repeated file reads (no code-intel) | files read per query | > 5 | LSP plugin cut tool calls 90%, cost 58% | dev.to; code.claude.com/costs |
| Repeated repo searches | search/list calls | high | 60–80% of tokens go to orientation, not the task | medium 70%-waste |
| Repeated failures → instructions | same tool/cmd failing | ≥ 3 | capture fix in AGENTS.md (cuts 50–90%) | /chronicle improve; augmentcode |

## High-value but NOT detectable from tk's current data

tk's VS Code transcript scan records tool REQUESTS (name + args) only — no model id,
token usage, cache stats, MCP server list, or thinking tokens. These need a data
source tk doesn't have yet (would require reading host config files or a usage API):

- Model routing (Opus for trivial tasks) — up to 10× cost multiplier
- Prompt-cache hit rate (target ≥ 60%; 90% cheaper cached) — ProjectDiscovery 7%→84%
- Extended-thinking budget on simple tasks — max effort = 10× low effort
- MCP server count / tool-schema bloat — 3 servers ≈ 72% of a 200k window; MCP vs CLI 17× — *partially detectable by reading ~/.copilot/mcp-config.json or Claude settings*
- Batch API + caching for non-realtime jobs — down to 5% of list price

## ROI-ranked interventions (from the sources)

1. Token budget + compact at 60% context → 35% week-1 saving
2. CLAUDE.md < 200 lines + move workflows to skills → 40–92% context
3. Structured CLAUDE.md for cache hits ≥ 60% → +20%
4. Model routing by task type → 20–92%
5. Cap extended thinking → 30–90% on simple tasks
6. Disable unused MCP servers → up to 72% context
7. PreToolUse hook to filter logs/test output → 60–90%/command  ← this is tk's core job

Full source list: see the research transcript. Key URLs: code.claude.com/docs/en/costs,
augmentcode.com/blog/how-to-write-good-agents-dot-md-files, branch8.com (72% team
case study), projectdiscovery.io (cache 7%→84%), github.blog ET formula.
