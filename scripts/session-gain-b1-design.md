# B1 — `tk gain --session`: saved tokens vs whole-session tokens

Status: PROPOSED (2026-06-09). Validated by A-spike `scripts/session-gain-probe.py`.
Scope owner decision recorded: existing per-command `tk gain` is **frozen**; this is
additive. Builds on ledger ① `history.jsonl` (see memory `metrics-ledger-implemented`).

---

## 1. Goal / non-goals

**Goal.** Answer the question the per-command gain can't: *"Of everything the agent
spent in this session after I onboarded tk, what fraction did tk save?"* — one honest
percentage per session (and a roll-up across sessions), counted from the tk-onboarding
cutoff forward.

**Non-goals.**
- Do **not** touch per-command gain math, output, or `savings_pct`. Different question,
  different denominator. They coexist.
- Not a billing/cost tool. We report a token-footprint ratio, not dollars (billed basis
  is an optional secondary line, §4).
- No new always-on hot-path work beyond two cheap env reads at record time (§3).

---

## 2. Architecture at a glance

```
record time (shim hot path)          report time (`tk gain --session`)
─────────────────────────            ─────────────────────────────────
recordHistory()                      1. group history rows by (host, session_id)
  + session_id  ← env                2. for each session: pick a denominator reader
  + host        ← env                     by `host`  → sum real usage AFTER cutoff
        │                            3. saved = Σ saved_tokens in that session
        ▼                            4. rate  = saved / unique_content (de-churned; ADR §4)
   history.jsonl  ──────────────►    5. degrade to N/A where host has no usage source
```

The `host` field is **not a label — it is the routing key** that selects which
session-usage reader runs (§5). This is the load-bearing design idea.

---

## 3. Data model change — `history.jsonl` gains two fields

Add to `HistoryRecord` (`src/core/history.ts:17`), both **optional, best-effort**,
matching the existing precedent of `model` / `source_adapter`:

```ts
  // Session attribution for `tk gain --session` (B1). Captured from the host's
  // env at record time; absent when not invoked under a known agent host (e.g. a
  // human shell) — absent is honest, the row just won't join to any session.
  session_id?: string;
  host?: string;   // "claude-code" | "codex" | "copilot-cli" | "vscode" | ...
```

Populate in `recordHistory()` (single write site, `src/core/history.ts:51`) via a new
`detectHostSession()` helper in `src/core/hostSession.ts`:

| host id       | session_id env                | host signal env                          |
|---------------|-------------------------------|------------------------------------------|
| `claude-code` | `CLAUDE_CODE_SESSION_ID`      | `CLAUDECODE` / `CLAUDE_CODE_ENTRYPOINT`  |
| `codex`       | `CODEX_COMPANION_SESSION_ID`* | `AI_AGENT` startswith `codex` / cli ver  |
| `copilot-cli` | (TBD — verify, §7 Q2)         | `COPILOT_*` / `AI_AGENT`                  |
| `vscode`      | n/a (no env reaches shim)     | —                                        |

\* **Caveat (verified on this machine):** when the Codex companion plugin runs *inside*
a Claude session, `CODEX_COMPANION_SESSION_ID == CLAUDE_CODE_SESSION_ID`. Resolve host
**first** (from the host signal), then read that host's session var — never assume a
single global id. Precedence: explicit Codex-standalone signal > Claude. Document the
chosen precedence in a test fixture.

**Privacy/footprint:** session_id is an opaque uuid already on the user's disk; no path,
arg, or content is added. One short string per row.

**Back-compat:** old rows lack both fields → they simply don't join to any session and
are excluded from `--session` (they still count in per-command gain). No migration.

---

## 4. ADR — the denominator (口径). Shipped as `docs/adr/0010-session-unique-content-basis.md`

> Supersedes the earlier "footprint (in+cc)" headline of **8.56%**. That denominator
> is **churn-inflated** (see below) and understates the real effect. The honest,
> decomposable headline is **~27%**.

### Two metrics, two questions (both measured, never estimated)

- **Per-command** — `saved / raw_tokens`, the compression ratio of one command's output.
  Measured: `rg` 0→**88.5%**, `git log` **82%**, `git status` **39%**, `git diff` **24%**;
  dev-command range **60–90%**. (This is the frozen existing `tk gain`; unchanged.)
- **Per-session** — of *everything the agent spent in the whole session* after tk
  onboarding, what fraction tk saved. Headline: **~27%** on real Claude Code data.

### Decision: denominator = session UNIQUE content (de-churned), not footprint

`session_savings_pct = saved / unique_content`, where `unique_content` ≈ the session's
distinct context counted **once** (≈ Σ peak context), NOT the per-turn sum of
`input + cache_creation` (that sum re-counts the same context every time prompt-cache
re-writes it = **churn**).

### How it's computed (the two-factor decomposition — this is why ~27% is defensible)

On real A-spike data (576 cmds, 18 sessions, `saved` = **1.31M**, `raw_tokens` =
**1.97M**):

```
session saving = reach × in-reach compression
               = (raw_tokens / unique_content) × (saved / raw_tokens)
               = 40.5%                          × 66.5%
               ≈ 27%
```

- **reach 40.5%** — tk-touchable shell output (`raw_tokens` 1.97M) as a share of the
  session's unique content (≈4.86M).
- **in-reach compression 66.5%** — tk compressed 1.31M of the 1.97M it touched.
- `0.405 × 0.665 ≈ 0.27`. The same `saved / unique_content = 1.31M / 4.86M ≈ 27%`.

### Why NOT the other denominators

| basis | denominator | session saving | verdict |
|-------|-------------|----------------|---------|
| **unique content (de-churned, ≈Σ peak ctx)** | ~4.86M | **~27%** | ✅ headline |
| footprint+saved `in+cc` (per-turn sum) | 15.3M | 8.56% | ❌ churn-inflated → understates |
| naive `in+cc+cr` | 554M | 0.24% | ❌ `cache_read` re-reads same ctx every turn |
| billed `in+1.25cc+0.1cr+out` | 75.9M | 1.70% | ⚠️ economic basis, optional 2nd line |

`cache_read`/`cache_creation` summed across turns double-count content prompt-caching
re-reads; de-churning to unique content is the only apples-to-apples basis vs tk's
one-time `saved`.

### Why tk reaches only ~40% — and what the other ~60% is (the hard ceiling)

tk's single interception point is **PreToolUse on shell commands**, so it can only see
**shell tool output** (`git`/`rg`/`ls`/test runners…) = ~40% of unique content. The
remaining **~60% tk structurally cannot touch**:

- **model reasoning + assistant output** — the model's own generated tokens;
- **built-in tool results** — `Read`/`Grep`/`Glob`/web-fetch/MCP outputs (NOT shell), which
  never pass through tk's shell hook;
- **system prompt + instructions + skills + agents** loaded into context;
- **user prompts**.

This 60% is the **delivery-mechanism ceiling**, not a compression weakness: reaching it
needs a different interception layer (the request-body/L3 proxy on Claude Code), which
is out of scope here. Honest framing: "tk saves ~27% of the whole session by compressing
the ~40% it can reach by two-thirds; the rest is non-shell content tk's hook never sees."

### Secondary line (optional, off by default)

A "billed" rate using Anthropic cache multipliers (1.25× write, 0.10× read) for users who
think in cost — clearly labeled as a different basis so it's never confused with the
content-footprint headline.

---

## 5. Per-host session-usage readers

New module `src/session/` with a registry keyed by `host`:

```ts
interface SessionUsageReader {
  // Sum footprint (input + cache_creation) over turns with ts >= cutoff.
  // Returns null when this host has no readable usage → caller shows N/A.
  read(sessionId: string, cutoff: Date): Promise<SessionFootprint | null>;
}
```

| host | source | how |
|------|--------|-----|
| `claude-code` | `~/.claude/projects/<slug>/<session_id>.jsonl` | per-line `message.usage`; sum `input_tokens + cache_creation_input_tokens` for assistant lines with `timestamp >= cutoff`; dedup by `uuid` |
| `codex` | `~/.codex/sessions/YYYY/MM/DD/rollout-<session_id>.jsonl` | richest: per-turn `info.total_token_usage` is **cumulative** — could read last line, but to honor the cutoff sum `last_token_usage.{input_tokens,cached_input_tokens}` per turn ≥ cutoff |
| `copilot-cli` | `~/.copilot/session-state/<session_id>/` | **UNVERIFIED** format (§7 Q2). Reader returns null until confirmed → degrades cleanly |
| `vscode` | — | **no reader** — chatSessions carry no token usage and no env reaches the shim. Always N/A |

`<slug>` for claude-code = cwd with `/`→`-` (already how CC names its project dir; the
shim knows cwd). Reader resolution is filesystem-only, read-only, best-effort: any
missing file / parse error ⇒ null ⇒ N/A, never throws into the report.

---

## 6. CLI surface

`tk gain --session` (new flag on the existing `gain` command):

```
Session savings (since tk onboarding, 2026-06-07)
  basis: session unique content (de-churned ≈ Σ peak ctx); see ADR §4
  (rows illustrative; reach≈40% × in-reach compression≈67% ⇒ ~27%)

  session   host         cmds   saved      uniq-ctx    saved%
  eb18baf1  claude-code   142   310,402    1,131,000   27.4%
  8cf04fbd  claude-code    98   180,113      690,000   26.1%
  1350bc5d  vscode         12        —            —     n/a (host has no token usage)
  ─────────────────────────────────────────────────────────
  total     (computable)  576  1,310,735    4,860,000   27.0%
```

- `--session --json` for machine consumption.
- Roll-up `total` row **only sums computable sessions**; N/A sessions are listed but
  excluded from the aggregate (and a footnote says how many were excluded — never
  silently drop, per the project's "no silent caps" rule).
- Reuses `tk gain` rollup plumbing (`src/core/gain.ts`, `rollup.ts`); `--session` swaps
  the grouping key (session_id) and the denominator source (reader vs raw_tokens).

---

## 7. Onboarding cutoff & open questions

**Cutoff semantics.** "Since onboarding" = earliest `history.jsonl` timestamp for that
`(host, session_id)` — i.e. the first tk-wrapped command in the session. Per-session
cutoff (not a global one) so a brand-new session counts from its own first command, and
we never credit/charge tk for turns before it was active in that session.

**Open questions:**
1. **Q1 — sidechains.** Claude subagent turns (`isSidechain:true`) spend tokens too. A-spike
   saw 0 here, but include them in footprint? Proposal: include (real spend), but tag the
   share so it's auditable. Decide in ADR.
2. **Q2 — Copilot CLI format.** `~/.copilot/session-state/` was empty on this machine.
   Before claiming copilot-cli support, capture one real session and grep for
   machine-readable token counts (docs confirm `/usage` + `/chronicle cost` exist, so the
   data is tracked internally). Until verified: reader returns null, host shows N/A.
3. **Q3 — cwd→slug edge cases.** CC's project-dir slug rule for paths with dots/unusual
   chars — verify the transform matches before relying on it; fall back to scanning the
   project dir for a file whose first line's `sessionId` matches.

---

## 8. Phasing

- **P0 (capture).** Add `session_id`+`host` to `HistoryRecord` + `detectHostSession()`;
  populate in `recordHistory`. Pure additive, no reader yet. Ship + start collecting.
  Tests: env-matrix fixtures incl. the Codex/Claude shared-id precedence case.
- **P1 (claude-code reader + CLI).** `src/session/` registry + claude-code reader +
  `tk gain --session` + ADR. This alone delivers the headline number for the primary host.
- **P2 (codex reader).** Add codex reader (cumulative `total_token_usage`).
- **P3 (copilot-cli).** Only after Q2 verification; else stays N/A.
- vscode: permanently N/A by design — documented, not a gap.

**Test plan:** unit per reader against checked-in fixture transcripts (a few real lines,
scrubbed); golden-file for the `--session` table; a property test that the `total` row
equals the sum of computable sessions and excludes N/A.
```
