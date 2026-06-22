# Measurement and claim boundaries

**Status:** accepted (grilling 2026-06-21 D10 / Q10; supersedes the earlier "proxy-screened,
target-shaped" framing — that machinery is demoted to evaluation-protocol detail). Refines K1/K9/K12 and
[ADR 0016](0016-measurement-before-feature.md).

Each host can prove a different thing, and the honesty rule is simply: **never let a number measured on
one host impersonate a number on another.**

## Decision

- **Claude Code headless = token proxy.** It is the only clean runner for `whole-task uncached input
  tokens` (total-incl-cached is an audit column only). Token deltas are reported with a footer stating
  they were measured on Claude Code, not VS Code Copilot, and no equivalent Copilot token reduction is
  claimed.
- **VS Code Copilot = target operational facts.** No clean token; it yields observational facts (tool
  calls, avoided reads, payload) under `estimate_kind:"opportunity"`, never summed into `saved_tokens`.
- **Human = portable task metrics.** `hit@1`, time-to-file, answer correctness from a task protocol.

## Default-configuration gate (the product-shape part of D10)

A knowledge layer earns a projection profile's default output budget by:
1. **Correctness** — a hard gate; task and profile correctness must not regress.
2. **Portable utility** — Copilot- and human-observable signals decide the default configuration.
3. **Proxy token** — Claude Code `whole-task uncached` acts only as a cost constraint and an auxiliary
   tie-breaker, never the sole basis for a default.

Configuration chosen this way is **periodically re-validated on Copilot** with the observational facts
above. (There is no runtime auto-falsification engine, no validation-status state machine, and no
automatic demotion — target-side data is observational and easily disturbed by task distribution; it
informs periodic review, it does not drive live behavior.)

## Claim boundary

K states only two kinds of conclusion: (1) on real tasks, does tk raise success or lower agent cost; (2)
do the declared-supported languages and graph capabilities actually work. A general comprehension %, a
single blended score, and cross-language or cross-host extrapolation are out of bounds.

## Consequences

- Honest by construction: a host's number never speaks for another host.
- Simpler than the superseded design: the disclosure is a footer plus periodic review, not a live
  falsification/demotion system.
