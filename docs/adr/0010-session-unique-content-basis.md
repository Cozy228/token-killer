---
status: accepted
---

# Per-session savings: the unique-content denominator (~27%, not footprint 8.56%)

ctx reports savings two ways, answering two different questions, both from **measured**
`raw − delivered` (never estimated):

- **Per-command** (`ctx gain`, frozen/unchanged) — `saved / raw_tokens`, the compression
  ratio of one command's output. Measured: `rg` 0→**88.5%**, `git log` **82%**,
  `git status` **39%**, `git diff` **24%**; dev-command range **60–90%**. An
  already-terse form (`git status --short`) healthily shows ~0%.
- **Per-session** (`ctx gain --session`, this ADR) — of *everything the agent spent in a
  whole session* after ctx onboarding, what fraction ctx saved. Headline: **~27%** on
  real Claude Code data.

This ADR fixes the per-session **denominator (口径)**. An earlier draft (B1 §4) headlined
**8.56%** on a `footprint = input + cache_creation` basis; that denominator is
**churn-inflated** and understates the real effect. The honest, decomposable headline is
**~27%**.

## Context

The per-command ratio cannot answer "of the whole session, how much did ctx save?" — it
has the wrong denominator (one command's output). The per-session question needs a
session-wide denominator, and the trap is what "the whole session" means once prompt
caching re-reads the same context every turn.

On real A-spike data (`scripts/session-gain-probe.py`; 576 cmds, 18 sessions,
`saved` = **1.31M**, ctx-touched `raw_tokens` = **1.97M**):

| basis | denominator | per-session saving | verdict |
|-------|-------------|--------------------|---------|
| **session unique content** (de-churned ≈ Σ peak ctx) | ~4.86M | **~27%** | ✅ headline |
| footprint+saved `in+cc` (per-turn sum) | 15.3M | 8.56% | ❌ churn-inflated → understates |
| naive `in+cc+cr` | 554M | 0.24% | ❌ `cache_read` re-reads same ctx every turn |
| billed `in+1.25cc+0.1cr+out` | 75.9M | 1.70% | ⚠️ economic basis, optional 2nd line |

`cache_creation`/`cache_read` summed across turns double-count content prompt-caching
re-writes/re-reads. ctx's `saved` is counted **once** (raw − compressed at command time),
so the only apples-to-apples denominator is the session's **distinct content counted
once** — not a per-turn sum.

## Decision

**Denominator = session UNIQUE content (de-churned), not footprint.**

```
session_savings_pct = saved / unique_content
```

where `unique_content` ≈ the session's distinct context counted **once** (≈ Σ peak
context), NOT the per-turn sum of `input + cache_creation` (that re-counts the same
context every time the prompt cache re-writes it = **churn**).

### How it is computed (the two-factor decomposition — why ~27% is defensible)

```
session saving = reach × in-reach compression
               = (raw_tokens / unique_content) × (saved / raw_tokens)
               = 40.5%                          × 66.5%
               ≈ 27%
```

- **reach 40.5%** — ctx-touchable shell output (`raw_tokens` 1.97M) as a share of the
  session's unique content (≈4.86M).
- **in-reach compression 66.5%** — ctx compressed 1.31M of the 1.97M it touched.
- `0.405 × 0.665 ≈ 0.27`, identical to `saved / unique_content = 1.31M / 4.86M ≈ 27%`.

Presenting both factors makes the number auditable: each is independently measurable, and
their product is the headline.

### Why ctx reaches only ~40% — and what the other ~60% is (the hard ceiling)

ctx's single interception point is **PreToolUse on shell commands**, so it only sees
**shell tool output** (`git` / `rg` / `ls` / test runners …) ≈ **40%** of unique content.
The remaining **~60% ctx structurally cannot touch**:

- **model reasoning + assistant output** — the model's own generated tokens;
- **built-in tool results** — `Read` / `Grep` / `Glob` / web-fetch / MCP outputs (NOT
  shell), which never pass through ctx's shell hook;
- **system prompt + instructions + skills + agents** loaded into context;
- **user prompts**.

This 60% is a **delivery-mechanism ceiling, not a compression weakness**: reaching it
needs a different interception layer (the request-body / L3 proxy on Claude Code via
`ANTHROPIC_BASE_URL`), which is out of scope here. Honest framing: *"ctx saves ~27% of the
whole session by compressing the ~40% it can reach by two-thirds; the rest is non-shell
content ctx's hook never sees."*

### Data model & per-host routing

Exact per-session attribution needs two best-effort fields on `HistoryRecord` (both
honest-absent, like `model`):

- `session_id` — already added for the dedup marker (ADR 0009): the hook injects a
  sanitized `--session <id>` flag, `recordHistory` stamps it. Absent on a human shell.
- `host` — the **denominator-reader routing key**, not a label. It selects which
  per-host usage reader supplies `unique_content`:

| host | unique-content source | status |
|------|-----------------------|--------|
| `claude-code` | `~/.claude/projects/<slug>/<session_id>.jsonl` `message.usage`, de-churned to distinct context | ✅ computable |
| `codex` | `~/.codex/sessions/.../rollout-<id>.jsonl` (`total_token_usage` cumulative) | ✅ computable |
| `copilot-cli` | `~/.copilot/session-state/<id>/` — format unverified | ⚠️ N/A until verified |
| `vscode` | transcripts carry **no token usage**, no env reaches the shim | ❌ permanently N/A |

A session whose host has no reader is **listed but excluded** from the roll-up total
(never silently dropped — the project's "no silent caps" rule). Per-command gain still
covers every host, including VS Code.

### Onboarding cutoff

Per-session: "since onboarding" = the earliest `history.jsonl` timestamp for that
`(host, session_id)` — the first ctx-wrapped command in that session. ctx is never
credited for turns before it was active in the session.

### Optional billed line

A secondary "billed" rate using Anthropic cache multipliers (1.25× write, 0.10× read),
off by default, for users who think in cost — clearly labeled as a different basis so it
is never confused with the content headline.

## Considered alternatives

- **footprint `input + cache_creation` summed per turn (the prior 8.56% headline).**
  Rejected: that sum re-counts the same context every time the cache is re-written across
  a long session (churn), inflating the denominator ~3× (15.3M vs the ~4.86M of distinct
  content) and understating ctx to 8.56%. Not apples-to-apples with ctx's one-time `saved`.
- **naive `input + cache_creation + cache_read` (0.24%).** Rejected: `cache_read` re-reads
  the entire context every turn (540M alone on the real repo) — pure double-counting.
- **Billing-dollar denominator.** Kept only as an optional, clearly-labeled secondary
  line; the headline is a content-footprint ratio, not dollars (B1 non-goal).
- **No per-session metric at all (per-command only).** Rejected: per-command 60–90% reads
  as a vanity number to a buyer; the honest "~27% of the whole session, with a clear 40%
  reach ceiling" is the credible figure and motivates the L3 direction.

## Relationship to other ADRs

- Builds on **ADR 0009** (session dedup) for the `session_id` carried on history rows.
- The ~60% ctx cannot reach is exactly the surface the **request-body / L3 proxy** would
  unlock on Claude Code — recorded here as the ceiling, pursued elsewhere.

> Implementation status: the **basis decision is accepted**; the `ctx gain --session` CLI
> + per-host readers (B1 P1–P3, `scripts/session-gain-b1-design.md`) are not yet shipped.
> Figures above are from the validated A-spike, not live output.
