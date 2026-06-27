# Token Killer: Endpoint-Level Cost Control for GitHub Copilot

*A deployment and measurement proposal for controlling GitHub Copilot cost at the developer endpoint.*

> **"Endpoint"** here means each developer's managed device — the laptop or workstation IT already deploys to and governs. Token Killer installs there, not in any cloud service.

---

## 1. Executive Overview

Token Killer (`tk`) is a lightweight endpoint control layer for the **terminal context consumed by GitHub Copilot agent workflows**: it **reduces the terminal output delivered to the model, measures the resulting reduction, and surfaces additional context waste** across developer environments. It runs locally, in front of the tools Copilot already drives (`git`, search, tests, builds, file reads), and returns a compressed-but-faithful version of their output.

For a manager, three capabilities map to three jobs:

| Capability | Management value |
|---|---|
| **Runtime compression** | Directly cuts the terminal output entering Copilot's context — on every eligible command, on every endpoint. |
| **Inspect & optimize** | Finds standing waste in instructions, prompts, skills, and tool-call habits, and can correct it on the device. |
| **Gain & telemetry** | Proves the outcome with real, measured usage data — per endpoint and across the fleet. |

It ships with **zero runtime dependencies** and needs **no SaaS backend** for its core job. Its compression and telemetry paths are designed to **fail open**: when output cannot be handled safely, it is returned unmodified and the underlying tool result takes precedence.

**Scope.** Token Killer governs eligible terminal output and selected local context surfaces (instructions, prompts, agents, skills, editor settings) used by Copilot agent workflows. It does **not** control inline completions, model output, provider-side caching, or GitHub billing, and it cannot guarantee that every Copilot tool call is routed through its hook or shim.

---

## 2. The Enterprise Problem

GitHub Copilot is procured and managed centrally. Leadership can see aggregate seat usage and quota burn — but has **no lever over what each endpoint actually sends into the model**. That gap matters because of how agentic coding works:

- Coding agents repeatedly run `git`, code search, tests, builds, and file reads — often many times per task.
- A large share of that output is **noise**: duplicate lines, log spam, repeated paths, passing test cases, and context irrelevant to the next step.
- Terminal output included in a model request adds to input-token consumption; the final bill also depends on the model, cache treatment, included credits, and GitHub's billing rules.

Training and best-practice guidance help, but they act on people, not on invocations:

> **Policy and training influence developer behavior; endpoint controls affect every eligible tool invocation.**

And savings cannot be argued from theory — different teams, repos, and environments produce very different output profiles, so the real number has to be **measured where the work happens**.

One honest boundary up front: Token Killer can prove the difference between the **raw** output a tool produced and the **delivered** output handed to the agent. It **cannot** claim what share of GitHub's final bill came from terminal output — that attribution lives on GitHub's side.

---

## 3. How It Works at the Endpoint

```text
GitHub Copilot
      │  terminal command
      ▼
Token Killer
      ├─ executes the original developer tool
      ├─ applies a command-aware compressor
      ├─ validates the result (else returns raw)
      ├─ records measured usage locally
      └─ returns the original exit code
      ▼
git · rg · npm · tests · builds · file reads
```

Five principles keep this safe on every command: **command-aware compression** — each tool gets a purpose-built strategy, not blunt truncation; **evidence preservation** — paths, line numbers, error causes, and exit codes are kept; **fail-open** — when unsure, the original is returned unchanged, never a fabricated summary; **recoverability** — oversized output becomes a summary plus a pointer to a local copy, re-readable on demand; and **hot-path isolation** — reporting, telemetry, and analysis load only on the cold path, never on the per-command path.

---

## 4. Three Control Loops

### 4.1 Compress — reduce runtime output

Every captured eligible invocation records raw output, delivered output, an estimated token count, and the reduction; streaming passthrough commands record only the facts available (exit code, timing) without capturing their output. Small output is left untouched, and unsupported or unsafe commands pass through as raw. Optional session deduplication can suppress byte-identical repeats of read-only commands; it is measured in a separate ledger and is **never added to the compression total**. The original exit code is always preserved.

*Single measurements on this repository (character counts):*

| Workload | Raw | Delivered | Reduction |
|---|---:|---:|---:|
| Large `git show` | 73,646 | 869 | 99% |
| Large file diff | 15,087 | 162 | 99% |
| Source-structure read | 21,215 | 1,427 | 93% |
| Broad code search | 58,059 | 16,412 | 72% |

> Individual high-volume commands commonly show substantial reductions; **organization-level impact must be established through a controlled pilot**, not extrapolated from these samples.

### 4.2 Inspect & optimize — find and fix structural waste

`inspect` is a **read-only** analyzer over two sources:

- **Runtime usage** — tool-call counts, broad searches, repeated reads, high-output commands, and tool-category distribution.
- **Static context** — Copilot instructions, prompt files, agent definitions, skills, and editor settings injected into the model every turn.

It answers questions a token counter cannot: what is loaded every turn but rarely used, what should move from global to path-scoped or on-demand, and which call patterns keep producing high output.

`optimize` turns those findings into endpoint governance — without leaving it at "advice":

```text
observed usage → findings → deterministic plan
   → preview → backup → controlled apply → restore
```

By default `optimize` only **prints the plan**. Writes require an explicit apply, are **backed up before modification**, and are **reversible**. Deterministic context and editor-setting findings can be applied automatically; behavioral and free-form findings remain recommendations only.

### 4.3 Gain & reporting — prove the outcome

`gain` is not a single "savings counter." It is **four independent management views**:

| View | What it answers |
|---|---|
| Measured command savings | How much terminal output was actually reduced |
| Optimizer deltas | How much standing context shrank after optimization |
| Governance opportunities | How many high-cost behaviors were surfaced or blocked |
| Quality guardrails | Whether compression introduced any failure or fallback |

These four are shown side by side and are **never summed into one headline number** — that separation is enforced in the product, so measured values, deltas, and heuristic opportunities are not blended into an inflated total.

A pilot rolls these views up across endpoints. The sample below is a **single developer installation** — every eligible command captured via the host-agnostic shell shim — and it separates what is *measured* from what is *estimated*:

*Single-endpoint sample. Window 2026-06-07 to 2026-06-27 · Token Killer 0.3.1 · macOS (arm64), shell shim · scope: all eligible invocations on one installation.*

| Metric | Value | Evidence type |
|---|---:|:---|
| Eligible invocations observed | 4,964 | Measured |
| Raw output characters | 40.0M | Measured |
| Delivered output characters | 20.0M | Measured |
| Character reduction | 50.0% | Measured |
| Filtered output accepted / quality fallback to raw | 93% / 7% | Measured |
| Token Killer processing failures | 0 | Measured |
| Estimated raw input tokens | 10.8M | Estimated |
| Estimated delivered input tokens | 5.4M | Estimated |
| Estimated token reduction | 49.9% | Estimated |
| Input-cost equivalent at $3/Mtok | ~$16 | Scenario estimate |

The dollar line is a scenario at a placeholder rate, not a GitHub bill.

**Fleet impact is computed after the pilot**, from the observed distribution rather than one developer extrapolated:

> median estimated input tokens saved per active endpoint × active endpoints × active days × the organization's applicable Copilot input rate

| Stage | Active endpoints | Saved input tokens / endpoint | Fleet total |
|---|---:|---|---|
| Pilot | 25–50 | measured during pilot | calculated |
| Selected teams | ~100 | pilot median | projected |
| Broad deployment | N | pilot P25 / median / P75 | range |

---

## 5. Measurement Honesty

The reader will, rightly, question token numbers, so the proposal is explicit about evidence. **Raw** and **delivered** output (bytes/characters) are directly measured. **Tokens** are derived from the delivered text by one calibrated offline estimator — tuned for code, logs, JSON, and diffs, but **not** GitHub's tokenizer. **GitHub-billed tokens** are a separate data source `tk` cannot obtain.

> **Character reduction is directly measured. Token reduction is estimated. Provider-billed token usage remains a separate data source.**

For enterprise reporting, `tk` endpoint data and Copilot admin data can be **correlated by time window or cohort** — not attributed per request. That is the honest ceiling either dataset supports.

---

## 6. Enterprise Telemetry

Telemetry exists to let an organization govern with **real data**, not anecdotes. The payload is aggregated and **pseudonymous**: a random, non-reversible device identifier enables installation deduplication and retention analysis without transmitting usernames, hostnames, repository names, paths, prompts, or source content.

**Recommended collected:** version; OS/architecture; active endpoints; 24-hour and cumulative invocation counts; tokens saved and savings percentage; compression ratio; handler/category mix; **redacted command stems** (e.g. `git diff`, `npm test` — never the arguments); fallback and parse-failure counts; low-yield handlers; 30-day active days; inspect finding types and counts; estimated cost / AI-credits.

**Explicitly never collected:** prompts; source code; raw terminal output; file paths; full command arguments; repository names; username or hostname; session content.

**Customizable, with discipline.** An enterprise build can add **enumerated** reporting dimensions (e.g. deployment ring, business unit, region, Copilot policy version) injected as closed enums by the build or device-management system, never free text.

**Policy.** Generic builds bind no endpoint, so network upload is inert. An enterprise build fixes an internal endpoint at compile time; the default state is configurable; users can still disable it; and network sends happen only on the cold path (`gain` / `inspect`), never on the per-command hot path. When an enterprise build ships default-on, describe it as **managed telemetry, enabled per the organization's endpoint policy and visible to the user** — not "opt-in."

**Boundaries.** The CLI provides only the endpoint-side payload and its transport. Fleet aggregation, storage, retention, access control, and dashboards are the responsibility of the internal telemetry service. Separate aggregate raw- and delivered-token totals are a recommended enterprise extension, not a current field.

---

## 7. Security & Operational Footprint

The honest framing is **a minimal, local-first, and auditable security footprint** — not "no impact."

What the product commits to:

- Zero runtime package dependencies; the artifact ships only its build output and docs.
- No SaaS backend is required to perform compression; no additional model is called; no code is generated or guessed.
- Unsupported commands pass through; the original exit code is always preserved.
- The telemetry endpoint is fixed at enterprise build time and **cannot be redirected by an end user**.
- Telemetry is fire-and-forget and off the command hot path, so a network failure cannot block a developer command.

What it honestly discloses:

- It sits in the shell/agent command-execution chain.
- For recoverability, large outputs may write **local raw snapshots that can contain source code, paths, or logs** (these are local recovery copies, not redacted).
- An enterprise distribution should set a **retention period, disk permissions, and a cleanup policy** for that local data directory.
- A security review should cover the hook, the PATH shim, the package-update path, and the local data directory.

---

## 8. Enterprise Distribution & Rollout

```text
source → CI security & product tests → controlled, versioned CI build
  → approved artifact → private npm registry
  → endpoint management / bootstrap → ring rollout
  → telemetry validation → broader deployment
```

Recommended practice:

- A **private npm registry** as the single distribution source; **pinned versions** (no live pull of `main`).
- CI gates: typecheck, product tests, install tests, and smoke tests.
- The enterprise **telemetry endpoint fixed at build time**; **checksums, provenance, and an SBOM** per release; package integrity and any endpoint-distribution wrapper following the organization's existing software-signing standard.
- A **ring rollout** — pilot, then selected teams, then broad — with **fast rollback** to the prior version, and configuration versioned separately from the binary.
- Release gates on regressions in fallback rate, failure rate, or latency.

The repository already supports private-registry distribution and a slim package (build output plus docs); checksums, provenance, SBOM, signing, and rollout rings are the additions for an enterprise release standard.

---

## 9. Pilot & Success Criteria

The pilot is scoped to a **decision**, not an open-ended trial. Suggested metrics:

- **Cost effectiveness** — delivered-token reduction; estimated cost avoided; yield by handler; coverage of high-output commands.
- **Safety** — exit-code parity with the unwrapped tool; fallback rate; compression-failure rate; recovery availability; P50/P95 added latency.
- **Adoption** — active endpoints; invocations per endpoint; version coverage; 7- and 30-day retention.
- **Context optimization** — standing context tokens found; optimizations applied; before/after delta; changes reverted.

Suggested go-criteria (thresholds tunable to your environment):

```text
Proceed to broad deployment when:
  - median delivered-output reduction ≥ 40%
  - P95 added latency stays under the agreed threshold
  - processing failure rate < 0.1%
  - no confirmed loss of actionable error evidence
  - telemetry and local-retention controls pass security review
```

---

## Decision Requested

**Approve a two-week controlled pilot across 25–50 representative developer endpoints.** This requires enabling the Copilot hook in VS Code settings — the supported integration point that lets `tk` see and compress the agent's tool output. It currently runs through a shim as a temporary workaround; the hook is the stable path we are asking to enable. Agreed thresholds for latency, failure rate, and evidence preservation round out the setup.

At the end, DevOps receives a measured report — adoption, raw-versus-delivered output, estimated token reduction, quality guardrails, endpoint latency, and a fleet cost model built from the observed distribution rather than a single-user extrapolation.

*Direction: beyond cost control, Token Killer's arc is a broader developer-context infrastructure — one curated context base projected per task for engineers and agents — but that is a later step; this pilot stands on its own.*
