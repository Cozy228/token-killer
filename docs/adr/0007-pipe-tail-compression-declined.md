---
status: accepted
---

# Pipe-tail compression investigated and declined

A proposal (`/tmp/ctx-handoff-pipeline-compression.md`) argued that since piped
commands account for ~67% of agent Bash output bytes and ctx leaves the pipe
**tail** raw, ctx should grow a "filter-mode" path that rewrites `cmd | grep X`
into `cmd | ctx grep X` and compresses the tail. We measured 85 real Claude Code
sessions (2026-06-05…06-08) before building anything. **The evidence says the
safe, lossless payback is under 1% of total tokens, so we are not building it.**

## Context

Delivery in these sessions is the **hook** (`~/.claude/settings.json` PreToolUse →
`ctx hook claude` → `src/hook/rewrite.ts`), **not the shim** (no shim dir on PATH,
`CTX_SHIM_DIR` empty). `rewriteCommand` **deliberately never rewrites the
right-hand side of a `|`** (`rewrite.ts`: `if (seg.precededBy === "|") return
seg`) — the original guardrail against wrapping an unsafe tail like `| xargs rm`.
So every pipe tail (`head`, `tail`, `grep`, `sort`, …) reaches the agent raw **by
design**, while the pipe **head** (`ctx git diff | head`) is rewritten and
compressed.

The handoff's two technical premises were both wrong against the code:
- "ctx needs a new filter-mode execution path to feed a tail stdin" — false.
  `executor.ts` already pipes `process.stdin` into every spawned child, and
  `readLike`/`diff` already read stdin. The execution layer supports it today;
  only the rewrite does not emit `ctx <tail>`.
- "pipes run raw" — half true. The tail is raw; the **head is already
  compressed**, which is the load-bearing fact for the follow-up below.

## Evidence

| Bucket | Bytes | % of all output | Safe lossless headroom |
|---|---|---|---|
| `head` / `tail` tails | 1.46M | **46%** | fold long lines 4.6% + dedup 2.5% ≈ **3% of total** |
| `grep` / `rg` tails | 0.09M | 3% | 19% of bucket → **~0.6% of total** (and these have a handler already) |
| other tails (`echo`/`sort`/`sed`/`cat`/`cut`/`wc`) | 0.62M | 19% | ≈0 — agent-authored prose, transforms, or already-tiny counts |
| **pipe total** | **2.15M** | **68%** | **< 1% safely + losslessly recoverable** |

Why `head`/`tail` — the 46% — is a dead end:
- **No fat tail.** Output sizes p50=543B, p90=2.9KB, p99=6KB; the 20 largest
  results are only 11.5% of the bucket. There is no whale to harpoon; you would
  have to compress everything to move the number.
- **Nothing to compress.** Only 0.9% of lines exceed 200 chars; duplicate-line
  bytes are 2.5%. The content is source / diffs / docs / logs — incompressible
  prose the agent **deliberately bounded** with `-N`. Its upstream is dominated by
  `cd …; for f in …; do echo "=== $f ==="; grep …; done | head` — composite shell
  scripts, not single tool invocations ctx can route.
- **Lossy here is forbidden.** Dropping lines from `cat goal.md | head -80`
  deletes content the agent explicitly asked to see — the recovery-less
  fake-complete `PRINCIPLES.md` forbids.

## Decision

**Do not add pipe-tail ("filter-mode") compression.** Keep `rewrite.ts` skipping
the RHS of `|`. The compressible mass the proposal targeted is mostly
incompressible prose the agent already bounded; the only handler-backed slice
(`grep`) is ~0.6% and is a small wiring fix, not a new architecture.

This also corrects a measurement myth: ctx's low compression footprint in these
sessions (~8–12% of results carry a compression signature) is **not** ctx failing
to fire. It is the ceiling of compressible content — most agent output is prose,
and the largest savings come from **guidance** steering the agent to native terse
forms (`git --stat`/`--short`/`--oneline`, the `Read` tool over `cat | head`), not
from the compressor.

## Consequences / follow-ups

1. **Left-segment lossy compression is a live correctness bug (separate track).**
   Because the hook rewrites the pipe head, `git diff | grep -c '^+'` greps the
   **compacted** diff and miscounts; any `cmd | <filter>` where `cmd` has a ctx
   handler feeds the filter lossy data. The fix is to **not compress a segment
   whose stdout flows into a downstream pipe stage** (only the final stage's
   stdout reaches the agent). Tracked independently of this decision.
2. **`grep`/`rg` as a pipe tail (~0.6%) stays uncompressed** under the hook by the
   RHS-skip rule. Not worth a carve-out on its own; revisit only if bundled with
   (1).
3. **Reversal trigger.** Revisit if delivery moves to the shim (which *does* wrap
   tails) for a host whose agents emit large, structured, losslessly-compressible
   pipe tails — a different population than the prose-heavy sessions measured here.
