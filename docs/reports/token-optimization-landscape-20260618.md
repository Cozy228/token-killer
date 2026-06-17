# Token-Optimization Landscape — strategies & representative projects (2026-06-18)

> Companion to [`token-optimization-best-practices-20260611.md`](./token-optimization-best-practices-20260611.md).
> That file ranks *detectable practices*; this file maps the *full technique space*
> (without limiting to tk's current command-wrapper form) and pins each direction to
> **real, verified GitHub projects** to study.
>
> Scope note: the brief was "open the aperture — anything technically feasible that
> helps token optimization, not limited to token-killer's current design." So this
> covers surfaces tk's DESIGN currently marks "明确不做". It is a research map, not a
> roadmap commitment.

---

## TL;DR — the three things that matter most

1. **tk's lineage is now explicit.** `rtk` = **"Rust Token Killer"** ([rtk-ai/rtk]) — the
   command-output compressor this repo benchmarks "rtk parity" against. token-killer is the
   Node reimplementation + quality-gate hardening of that idea.
2. **Two direct, larger competitors exist** (the user's references): **headroom**
   ([chopratejas/headroom]) and **leanCTX** ([yvgude/lean-ctx]). Both occupy the *same*
   "compress everything the agent reads" space as tk, but as **multi-surface products**
   (library + proxy + MCP server + shell hook), not a single command wrapper. They are the
   clearest "what tk could grow into" references.
3. **The biggest unclaimed leverage is the architectural pivot** from *command wrapper*
   (touches ~1.5 of 10 token surfaces) to *API-layer proxy / middleware* (touches ~7).
   That single move unlocks history compaction, prompt-cache economics, output-diff, model
   routing, and lazy tool loading at once. headroom and leanCTX both already ship a proxy
   surface for exactly this reason.

> **Data caveat:** star counts are rough June-2026 snapshots and drift. Several large counts
> (rtk ~63k, headroom ~31k, GitNexus ~42k, Understand-Anything ~63k) sit on repos <1 year old
> and were flagged by the research pass as possibly virality-inflated — treat magnitudes as
> "small / mid / large", not as precise figures. A handful (claude-code, PCToolkit) were not
> directly fetched and are marked accordingly.

---

## The token lifecycle — 10 surfaces, and where tk sits today

| # | Surface | Re-sent | tk today | Leverage |
|---|---|---|---|---|
| 1 | Conversation history | every turn (compounding) | ✗ | **highest** |
| 2 | Prompt-cache economics | every turn | ✗ | very high |
| 3 | Output generation (~4× price) | — | guidance only | very high |
| 4 | Tool / MCP schemas | resident every turn | counts only | mid–high |
| 5 | Repo map / code graph | on demand | per-file symbols only | high |
| 6 | Code-intel retrieval (read less) | on demand | command-output compression | high |
| 7 | Model routing | per call | ✗ (deferred) | ~10× |
| 8 | Reasoning / thinking budget | per call | ✗ | ~10× |
| 9 | Subagent context isolation | — | ✗ (deferred) | high |
| 10 | Command output | per call | ✅ **core** | mid |
| + | (enabler) LLM proxy / gateway | — | ✗ | unlocks 1,2,3,4,7,8 |
| + | (enabler) Recovery / response cache | — | rawStore + session-dedup | mid |

---

## 1. Conversation history compaction & external memory

**Why:** history is re-sent every turn — turn 30 ≈ 31× turn 1. The compounding giant of long
sessions. Techniques: summarize/evict old turns & tool-outputs, observation masking, externalized
long-term memory (MemGPT pattern), KV-cache-aware compaction.
**Nature:** lossy, but reconcilable with tk's "no fabrication" rule if paired with raw recovery.

| Repo | URL | ~Stars | Lang | Technique | Status |
|---|---|---|---|---|---|
| OpenHands/OpenHands | https://github.com/OpenHands/OpenHands | ~77k | Py/TS | **Condenser**: `observation_masking`, `llm`(summarize), `recent`, `amortized`, `llm_attention` — clearest real impl of both evict + mask | active |
| letta-ai/letta (ex-MemGPT) | https://github.com/letta-ai/letta | ~23k | Python | Canonical OS-style tiered memory; pages core context in/out of archival/recall stores | active |
| mem0ai/mem0 | https://github.com/mem0ai/mem0 | ~58k | Py/TS | Drop-in memory layer: extract facts to vector/KV/graph, recall later | active |
| topoteretes/cognee | https://github.com/topoteretes/cognee | ~17k | Python | KG-flavored memory (ECL pipeline → graph+vector), MCP integration | active |
| microsoft/LLMLingua | https://github.com/microsoft/LLMLingua | ~6k | Python | Names KV-cache compression (but it's an inference tool, see §10) | slow (v0.2.2 2024) |

> Note: `cpacker/MemGPT` redirects to letta — same lineage, not a separate repo.
> tk already has a file-based memory system → letta/mem0 are the natural "externalize & evict" references.

## 2. Prompt-cache economics

**Why:** cached prefix is ~90% cheaper and applies *every* turn. Levers: stable-prefix ordering
(system→tools→instructions first, volatile last), auto `cache_control` breakpoint insertion,
killing cache-busting churn (timestamps/run-ids in stable prefix).
**Nature:** lossless. **This is the one DESIGN declined ("input cache optimizer") on the grounds
that "tk doesn't control prompt assembly" — true only for the wrapper form; a proxy controls it.**

| Repo | URL | ~Stars | Lang | Technique | Status |
|---|---|---|---|---|---|
| anthropics/claude-cookbooks | https://github.com/anthropics/claude-cookbooks | ~45k | Jupyter | Canonical `cache_control` reference (`misc/prompt_caching.ipynb`) | active |
| montevive/autocache | https://github.com/montevive/autocache | ~75 | Go | Transparent proxy auto-injecting `cache_control` by placement strategy | active, small |
| flightlesstux/prompt-caching | https://github.com/flightlesstux/prompt-caching | ~127 | TS | MCP plugin for Claude Code: breakpoint injection + cacheability analysis + savings tracking (closest "coding agent" fit) | active, early |
| BerriAI/litellm | https://github.com/BerriAI/litellm | large | Python | `cache_control_injection_points` to auto-add Anthropic breakpoints | active |

> Server-side KV/prefix caching (different layer, only if self-hosting): vllm-project/vllm
> (Automatic Prefix Caching), sgl-project/sglang (RadixAttention), LMCache/LMCache. Don't conflate
> these with API-level `cache_control` economics.

## 3. Output-token reduction (~4× price — top ROI per token)

**Why:** output is billed ~4×. Levers: emit **diffs / search-replace blocks** instead of whole
files; **apply/speculative-edit models** (small model expands a terse lazy edit into full file);
**brevity / "code-only" directives**.
**Nature:** lossless (it changes *how* the model writes, not what it knows).

| Repo | URL | ~Stars | Lang | Technique | Status |
|---|---|---|---|---|---|
| Aider-AI/aider | https://github.com/Aider-AI/aider | ~46k | Python | `SEARCH/REPLACE`, `udiff`, `diff-fenced` edit formats — emit only changed regions (their data: udiff "3× less lazy") | active |
| kortix-ai/fast-apply | https://github.com/kortix-ai/fast-apply | ~400 | Python | Fine-tune Qwen2.5-Coder into small 1.5B/7B "fast-apply" merge models | quiet but usable |
| JRedeker/opencode-morph-fast-apply | https://github.com/JRedeker/opencode-morph-fast-apply | ~150 | TS | OpenCode plugin wiring Morph hosted Fast-Apply | active |
| continuedev/continue | https://github.com/continuedev/continue | ~34k | TS | Explicit "Apply" model role (Morph / Relace / AST application) | **archived/read-only** |
| EliFuzz/awesome-system-prompts | https://github.com/EliFuzz/awesome-system-prompts | ~215 | text | Leaked system prompts — primary evidence of brevity directives | active |

> Hosted-only (no clean OSS repo): Morph (`morphllm`), Relace Instant Apply.
> tk's cheap immediate win lives here: a "code-only / terse" line in the budget block (40–70% output cut).

## 4. Tool / MCP schema optimization

**Why:** every connected MCP server's tool schemas sit resident in context all session. Levers:
lazy/on-demand tool loading ("search before invoke"), RAG-over-tools, schema minification, per-task
tool subsetting. (This very harness uses ToolSearch — lazy loading — as proof of the pattern.)
**Nature:** lossless. tk's mcp.ts counts servers only; this is the upgrade path.

| Repo | URL | ~Stars | Lang | Technique | Status |
|---|---|---|---|---|---|
| mcp-shark/lazy-tool | https://github.com/mcp-shark/lazy-tool | ~26 | Go | Local MCP discovery runtime, "search before invoke" + SQLite semantic catalog | active, small |
| fintools-ai/rag-mcp | https://github.com/fintools-ai/rag-mcp | ~4 | Python | RAG over tool metadata (>50% prompt-token cut claimed) | early |

Canonical references (issues/discussions, not repos): anthropics/claude-code #11364 & #23508
(lazy-load MCP tool defs → shipped "MCP Tool Search" ~Jan 2026); anomalyco/opencode #9350
("85% token reduction"); modelcontextprotocol discussion #532 (hierarchical tool management).

## 5. Repo map / code graph

**Why:** 60–80% of agent tokens go to *orientation*, not the task. A compact ranked symbol map read
once replaces opening many files. Plus code knowledge/call/dependency graphs for navigation.
**Nature:** lossless if pointers resolve to real `file:line`. **This is the strongest genuinely-new
opportunity for tk's current form (an opt-in projection command).**

| Repo | URL | ~Stars | Lang | Technique | Status |
|---|---|---|---|---|---|
| Aider-AI/aider | https://github.com/Aider-AI/aider | ~46k | Python | **Canonical repo-map**: tree-sitter + PageRank ranked symbols into a token budget (`--map-tokens`) | active |
| pdavis68/RepoMapper | https://github.com/pdavis68/RepoMapper | ~180 | Py/TS-query | Standalone reimpl of Aider's repo-map as CLI + MCP server | maintained |
| Egonex-AI/Understand-Anything | https://github.com/Egonex-AI/Understand-Anything | ~63k(!) | TS | Multi-agent builds a knowledge graph of files/functions/classes/deps | active, very young |
| abhigyanpatwari/GitNexus | https://github.com/abhigyanpatwari/GitNexus | ~42k(!) | TS | Client-side zero-server code knowledge graph + Graph-RAG agent | active, very young |
| potpie-ai/potpie | https://github.com/potpie-ai/potpie | ~5.5k | Python | Knowledge graph over large codebase to power graph-navigating agents | active |
| blarApp/blarify | https://github.com/blarApp/blarify | ~230 | Python | Codebase → graph (LSP + tree-sitter) in Neo4j/FalkorDB | active |

> Design doc to read: https://aider.chat/2023/10/22/repomap.html — the reference everyone cites.
> (!) = young/viral; treat star magnitude skeptically.

## 6. Code-intel retrieval (LSP / AST-chunk / embedding search)

**Why:** "read the symbol, not the file." LSP go-to-def/find-refs replaces grep+read (reported
−90% tool calls, −58% cost). AST-aware chunking + embedding search retrieve only relevant code.
**Nature:** lossless. Closest to tk's "read less, read smarter" mission.

| Repo | URL | ~Stars | Lang | Technique | Status |
|---|---|---|---|---|---|
| oraios/serena | https://github.com/oraios/serena | ~25k | Python | MCP toolkit: IDE-grade symbolic retrieval/edit via real LSPs (40+ langs) | active |
| isaacphi/mcp-language-server | https://github.com/isaacphi/mcp-language-server | ~1.5k | Go | MCP server exposing LSP semantic tools (def/refs/rename/diagnostics) | maintained |
| blackwell-systems/agent-lsp | https://github.com/blackwell-systems/agent-lsp | ~60 | Go | Orchestrates language servers into agent MCP workflows (65 tools) | active |
| zilliztech/claude-context | https://github.com/zilliztech/claude-context | ~12k | TS | Code-search MCP: Milvus index, hybrid BM25 + dense vector | active |
| cocoindex-io/cocoindex-code | https://github.com/cocoindex-io/cocoindex-code | ~2.1k | Python | AST chunking + embeddings CLI (~70% token savings claimed) | active |
| supermemoryai/code-chunk | https://github.com/supermemoryai/code-chunk | ~200 | TS | Tree-sitter AST-aware chunker at semantic boundaries | maintained |

> Sourcegraph Cody: main repo now 404 (taken down); only archived `sourcegraph/cody-public-snapshot`
> (~3.8k, archived Aug 2025) remains — historical reference only, don't treat as live.

## 7. Model routing by complexity (+ 8. reasoning-budget control)

**Why:** cheap model for easy tasks, expensive for hard = up to ~10×; capping extended thinking on
simple tasks = up to ~10× more. Needs a complexity classifier (rules or a small model) + a proxy seam.
**Nature:** lossless if classification is good (lossy quality risk if mis-routed).

| Repo | URL | ~Stars | Lang | Technique | Status |
|---|---|---|---|---|---|
| lm-sys/RouteLLM | https://github.com/lm-sys/RouteLLM | ~5k | Python | Canonical weak↔strong router (~85% cost cut @ ~95% quality, MT-Bench) | established, slowed |
| BerriAI/litellm | https://github.com/BerriAI/litellm | ~51k | Python | Gateway Router + fallback + "Auto Router" across 100+ APIs | very active |
| aurelio-labs/semantic-router | https://github.com/aurelio-labs/semantic-router | ~3.6k | Python | Embedding-similarity decision layer (no LLM call) to pick model/tool | active |
| Not-Diamond/RoRF | https://github.com/Not-Diamond/RoRF | ~240 | Python | Random-forest routers by query complexity (12 pretrained) | low activity |
| UMass-Embodied-AGI/BudgetGuidance | https://github.com/UMass-Embodied-AGI/BudgetGuidance | ~31 | Python | Steer generation under a token budget, no fine-tune (arXiv 2506.13752) | research code |
| Eclipsess/Awesome-Efficient-Reasoning-LLMs | https://github.com/Eclipsess/Awesome-Efficient-Reasoning-LLMs | n/a | MD | "Stop Overthinking" survey — index of thinking-budget work | curated list |

## 9. Subagent context isolation ("context quarantine")

**Why:** the real subagent token win isn't *routing* — it's *isolation*: a subagent explores in its
own narrow context and returns only a distilled result, so the parent never pays for the exploration
trace. (Orthogonal to the proxy; needs agent-framework integration.)
**Nature:** lossless to the parent.

| Repo | URL | ~Stars | Lang | Technique | Status |
|---|---|---|---|---|---|
| OpenHands/OpenHands | https://github.com/OpenHands/OpenHands | ~77k | Py/TS | Explicit sub-agent delegation; isolated contexts return only results — cleanest match | active |
| langchain-ai/langgraph | https://github.com/langchain-ai/langgraph | ~35k | Python | Subgraphs with isolated state + supervisor pattern (`langgraph-supervisor-py`) | active |
| crewAIInc/crewAI | https://github.com/crewAIInc/crewAI | ~53k | Python | Role crews; per-agent `respect_context_window` (hygiene, not strict quarantine) | active |
| ag2ai/ag2 (ex-AutoGen) | https://github.com/ag2ai/ag2 | ~4.7k | Python | Nested chats: inner chat isolated, only summary surfaces | active |
| anthropics/claude-code | https://github.com/anthropics/claude-code | n/a | CLI | Subagents in isolated context windows — caveat: shared billing, so the win is context real-estate, not $ | active |

## 10. Command-output compression — tk's home turf (the competitive set)

**Why:** wrap dev tools, compress stdout before the model reads it (60–90%/command). This is exactly
what tk does — listed so the direct peers/competitors are on record.
**Nature:** lossless by design (tk's quality gate is the differentiator).

| Repo | URL | ~Stars | Lang | Technique / angle | Status |
|---|---|---|---|---|---|
| rtk-ai/rtk | https://github.com/rtk-ai/rtk | ~63k(!) | Rust | **"Rust Token Killer" — tk's namesake/inspiration.** Single binary, 100+ commands, <10ms | very active (v0.42.4) |
| chopratejas/headroom | https://github.com/chopratejas/headroom | ~31k(!) | Python | **(user ref)** Compress tool output/logs/files/RAG; lib + proxy + MCP; content-type routing, reversible lossless mode (CCR), KV-cache-stable prefixes | very active (v0.26.0) |
| yvgude/lean-ctx | https://github.com/yvgude/lean-ctx | ~2.7k | Rust | **(user ref)** Local context-intelligence layer: shell-hook compression (95+ patterns) + MCP server (10 read modes) + tree-sitter AST (18 langs) + cross-session memory + LITM positioning | very active (v3.8.8) |
| mpecan/tokf | https://github.com/mpecan/tokf | ~181 | Rust | TOML per-tool filters + hooks; strips redundant `\|grep/tail` pipes | active |
| ojuschugh1/sqz | https://github.com/ojuschugh1/sqz | ~357 | Rust | Zero-config; emphasizes cross-invocation dedup (repeat read → ~13-token ref) — mirrors tk session-dedup | moderate |
| sliday/tamp | https://github.com/sliday/tamp | ~83 | JS | OpenAI-compatible **proxy** for Claude Code/Codex/Aider; per-command stdout noise stripping | less active |

> **Competitive read:** rtk is the ancestor. headroom & leanCTX are the "grown-up" versions — both
> went multi-surface (proxy + MCP + hook) and both added the things tk marks "明确不做" (history-stable
> caching, MCP read modes, cross-session memory, AST). headroom's "reversible lossless mode (CCR)" is
> essentially tk's quality-gate + rawStore philosophy productized. leanCTX's hybrid (hook + MCP + AST +
> memory) is the closest single project to "everything in this report under one roof."

## 11. Aggressive prompt compression (lossy) + semantic response cache

**Why:** highest ceiling, highest risk. Small-LM token dropping (LLMLingua: up to ~20×); semantic
response cache (return a cached answer for a *similar* query).
**Nature:** lossy → for tk-style products only viable as opt-in + forced raw recovery.

| Repo | URL | ~Stars | Lang | Technique | Status |
|---|---|---|---|---|---|
| microsoft/LLMLingua | https://github.com/microsoft/LLMLingua | ~6k | Python | Perplexity/self-info token dropping (LLMLingua/LongLLMLingua/LLMLingua-2) | slowed (2024) |
| liyucheng09/Selective_Context | https://github.com/liyucheng09/Selective_Context | ~422 | Python | Self-information pruning (EMNLP 2023) | stale, research |
| zilliztech/GPTCache | https://github.com/zilliztech/GPTCache | ~8k | Python | "Memcache for LLMs" — embed query, similarity match, return cached response | low activity |
| codefuse-ai/ModelCache | https://github.com/codefuse-ai/ModelCache | ~943 | Python | Enterprise GPTCache-style semantic cache | active |

> Surveys if you want breadth: 3DAgentWorld/Toolkit-for-Prompt-Compression (PCToolkit, unverified),
> ZongqianLi/Prompt-Compression-Survey.

## Enabler — LLM proxy / gateway (the architectural pivot)

**Why:** sitting between agent and provider lets you rewrite the *actual request payload* — which is
the control plane the wrapper form lacks. Unlocks surfaces 1, 2, 3, 4, 7, 8 at once. Both headroom and
leanCTX ship this surface deliberately.

| Repo | URL | ~Stars | Lang | Technique | Status |
|---|---|---|---|---|---|
| BerriAI/litellm | https://github.com/BerriAI/litellm | ~25–51k | Python | OpenAI-format proxy to 140+ providers; caching, routing, budget enforcement | active |
| Portkey-AI/gateway | https://github.com/portkey-ai/gateway | ~9k | TS | Fast gateway, 1600+ LLMs, simple + semantic caching, guardrails (fully OSS Mar 2026) | active |
| algorithmicsuperintelligence/optillm | https://github.com/algorithmicsuperintelligence/optillm | ~4.1k | Python | Inference-optimizing proxy (20+ techniques) — caveat: optimizes *accuracy*, can *increase* tokens | active |

---

## Synthesis — where tk sits and the leverage ranking

tk today = a hardened, quality-gated **surface 10** (command output) + half of **surface 6**.
rtk is its ancestor; **headroom and leanCTX have already expanded across most of this map.**

If reopening scope, leverage-ranked:

| Rank | Move | Surface | Enabler needed | Nature | Study |
|---|---|---|---|---|---|
| 1 | History compaction + tool-output eviction | 1 | API proxy | lossy+recover | OpenHands Condenser, letta |
| 2 | Prompt-cache ordering + breakpoints | 2 | API proxy | lossless | autocache, claude-cookbooks |
| 3 | Output as diffs + brevity directive | 3 | guidance/proxy | lossless | aider, fast-apply |
| 4 | Subagent context quarantine | 9 | agent framework | lossless | OpenHands, langgraph |
| 5 | Model + thinking routing | 7,8 | API proxy + classifier | lossless* | RouteLLM, litellm |
| 6 | Repo map / LSP retrieval | 5,6 | standalone tool (tk's current shape!) | lossless | aider repo-map, serena |
| 7 | Lazy tool / MCP schema loading | 4 | API proxy / MCP | lossless | lazy-tool, rag-mcp |
| 8 | Aggressive prompt compression | 11 | proxy + recovery | lossy opt-in | LLMLingua, GPTCache |

**Two honest paths:**
- **No architecture change (tk stays a tool):** ranks 3 (brevity in budget block) and 6 (repo map +
  LSP retrieval) are reachable now. Repo map is the highest-value genuinely-new capability for the
  current form — study aider's repo-map and oraios/serena.
- **Architecture pivot (tk becomes a proxy):** unlocks ranks 1, 2, 5, 7 — but that is exactly the
  product headroom and leanCTX already are. Differentiation would have to be tk's quality-gate
  ("never fabricate, lossless recovery") applied across all surfaces, not just stdout.

---

## Feasibility in ENTERPRISE VS Code Copilot (per direction + per project)

> The target host. It is the **most locked-down** of all hosts: the extension assembles the
> prompt and talks to GitHub's model backend over a closed channel. So feasibility is decided
> almost entirely by **which delivery channel a technique needs** — not by how good the technique
> or project is.

### Delivery channels available in enterprise VS Code Copilot

| Ch | Channel | Reaches | Robustness in locked enterprise |
|---|---|---|---|
| **C1** | PATH shim (`tk <cmd>`) | terminal commands the agent runs (`run_in_terminal`) | **highest** — terminal is rarely removed; policy-independent (ADR 0002) |
| **C2** | PreToolUse hook (`updatedInput`) | rewrite a command at protocol layer | medium — official **Preview** feature (`chat.useCustomAgentHooks` + `chat.hookFilesLocations`); `PreToolUse` can `allow`/`deny`/`ask` and rewrite via `updatedInput`. **No output rewrite** — `PostToolUse` can only add `additionalContext` or `block`, never modify a tool's output (no `modifiedResult`). |
| **C3** | MCP server (new tools) | inject NEW tools (repo-map, LSP, retrieval, memory) | medium — MCP is **GA** (VS Code 1.102, `chat.mcp.discovery.enabled`), **but the enterprise admin policy "MCP servers in Copilot" is DISABLED BY DEFAULT** — off until an admin enables it (then "Allow all" vs "Registry only"). So in a default locked org, this channel is closed. |
| **C4** | Host settings | `chat.tools.compressOutput.enabled` (VS Code 1.121, off by default) | low-med — some keys org-locked |
| **C5** | Instruction/context injection | AGENTS.md / copilot-instructions.md | low — advisory; model may ignore |
| **C6** | Model-payload control (API proxy / BYOK custom endpoint) | the request sent to the model | **narrow & off-path** — only via **BYOK "Custom Endpoint"** (Insiders/preview), gated by the "Bring Your Own Language Model Key in VS Code" policy (**enabled by default, admin can disable**). Using it **leaves the GitHub-hosted model path entirely** (your provider, your billing, no GitHub content filter). On the default GitHub-hosted path the request is processed by GitHub's own systems and is not third-party-interceptable. |
| **C7** | Copilot agent-loop internals | model choice, subagents | unavailable — closed (note: **history compaction is host-native**, see direction 1) |

### Verdict legend

- 🟢 **F0** — deliverable NOW via tk's terminal channel (C1 shim / C2 hook)
- 🔵 **F1** — deliverable via MCP server (C3), **org-policy gated**
- 🟡 **F2** — advisory / settings only (C4/C5) — nudge, cannot enforce
- 🔴 **F3** — infeasible here (needs C6/C7 — model payload or agent-loop access)

Per-project usability tag: **[Run]** = the project itself runs inside Copilot (MCP/VS Code-compatible, org-gated) · **[Port]** = standalone; not usable in Copilot, but its algorithm ports into a tk shim/MCP · **[Infra]** = different layer (proxy / server-side cache / full competing agent) — neither runs in nor ports to the Copilot context.

### Per-direction verdict

| # | Direction | Verdict | Needs | What is actually deliverable in enterprise VS Code Copilot |
|---|---|---|---|---|
| 1 | History compaction / memory | ✅ **host-native** (advisory 🟡) | host | **VS Code Copilot already auto-compacts when the window fills, and exposes `/compact` (with custom instructions).** Not tk's to build, and not interceptable. tk's only angle: advise *when/how* to compact via instructions (🟡). Long-term memory still possible as an MCP tool (🔵, MCP-policy gated). |
| 2 | Prompt-cache economics | 🔴 F3 (off-path only) | C6 | Copilot assembles & caches server-side on the GitHub-hosted path — no breakpoint/ordering access. Only possible if you leave that path via BYOK custom endpoint (preview, policy-gated). |
| 3 | Output reduction | 🟡 F2 (diff 🔴) | C5 / C6 | Brevity/"code-only" directive via instructions (🟡). Diff/apply edit-format is Copilot-owned (🔴). |
| 4 | Tool / MCP schema | 🟡 F2 | C4/C5 | Advise cutting MCP server count (tk already does); lazy-load is now a host feature ("MCP Tool Search"). |
| 5 | **Repo map / code graph** | 🟢 F0 / 🔵 F1 | C1 / C3 | **`tk map` in terminal (🟢)** or a repo-map **MCP server (🔵)**. Highest-value *new* capability that fits. |
| 6 | **Code-intel retrieval (LSP/AST/embed)** | 🔵 F1 (🟢 partial) | C3 / C1 | MCP servers (serena etc.) run in VS Code Copilot today (🔵, org-gated); LSP CLI via shim partial (🟢). |
| 7 | Model routing | 🔴 F3 | C6/C7 | Model is picker/admin-locked; can't auto-route. Nothing (user picks manually). |
| 8 | Reasoning budget | 🔴 F3 | C7 | Not exposed by Copilot. Nothing. |
| 9 | Subagent isolation | 🔴 F3 | C7 | Can't inject into Copilot's agent loop; Copilot ships its own. Nothing. |
| 10 | **Command-output compression** | 🟢 F0 | C1 / C2 | tk's core — shim + hook. Already shipped. |
| 11 | Aggressive prompt compression / semantic cache | 🔴 F3 | C6 | Both sit on the model call. Nothing. |
| + | **API proxy (enabler)** | 🔴 F3 | C6 | **The hard ceiling.** Narrow exception only if org permits a BYOK/custom model endpoint (rare in locked enterprise). |

### Per-project verdict

| Direction | Project | Tag | Verdict in enterprise VS Code Copilot |
|---|---|---|---|
| 1 History | OpenHands (Condenser) | Infra | 🔴 competing agent; only the *idea* of eviction, needs payload |
| 1 | letta / mem0 | Run | 🔵 usable as a memory **MCP tool** (explicit recall); cannot auto-evict Copilot window |
| 1 | cognee | Run | 🔵 same — KG memory via MCP |
| 1 | LLMLingua | Infra | 🔴 needs prompt payload |
| 2 Cache | claude-cookbooks / autocache / flightlesstux / litellm | Infra | 🔴 all act on the model request Copilot owns |
| 3 Output | aider (edit formats) | Port | 🔴 diff/apply format is Copilot-controlled; not portable into Copilot's editor loop |
| 3 | kortix-ai/fast-apply, JRedeker/morph, continue | Infra/Port | 🔴 apply-model lives in the agent's edit loop (closed in Copilot) |
| 3 | EliFuzz/awesome-system-prompts | Port | 🟡 source the brevity directive → inject via instructions (C5) |
| 4 Schema | mcp-shark/lazy-tool, fintools-ai/rag-mcp | Run | 🔵 could front other MCP servers, but org-gated; overlaps host's native MCP Tool Search |
| 5 Repo-map | **Aider repo-map** | Port | 🟢 **port the tree-sitter+PageRank algorithm into `tk map`** (terminal) |
| 5 | **pdavis68/RepoMapper** | Run/Port | 🟢 CLI via shim **and** 🔵 ships an MCP server — directly usable |
| 5 | Understand-Anything, GitNexus | Port | 🟡 standalone graph apps; technique portable, products don't run in Copilot |
| 5 | potpie, blarify | Run | 🔵 graph-backed MCP navigation (org-gated) |
| 6 Code-intel | **oraios/serena** | Run | 🔵 **installs as MCP in VS Code Copilot today** — symbol retrieval (org-gated) |
| 6 | isaacphi/mcp-language-server, agent-lsp | Run | 🔵 LSP-over-MCP, directly usable (org-gated) |
| 6 | zilliztech/claude-context | Run | 🔵 semantic code-search MCP, directly usable (org-gated) |
| 6 | cocoindex-code, supermemoryai/code-chunk | Run/Port | 🔵 index/chunk engine behind an MCP; or 🟢 CLI via shim |
| 7 Routing | RouteLLM, litellm, semantic-router, RoRF | Infra | 🔴 proxies/routers; Copilot model is admin-locked |
| 8 Budget | BudgetGuidance, Awesome-Efficient-Reasoning | Infra | 🔴 not exposed by Copilot |
| 9 Subagent | OpenHands, langgraph, crewAI, ag2, claude-code | Infra | 🔴 competing agent loops; can't inject into Copilot |
| 10 Cmd-output | rtk, tokf, sqz | Port | 🟢 same technique as tk → shim |
| 10 | **leanCTX** | Run | 🟢 shell-hook + 🔵 MCP work in Copilot; its **proxy part is 🔴** |
| 10 | **headroom** | Run | 🔵 MCP read-compression works; its **proxy part is 🔴** |
| 10 | sliday/tamp | Infra | 🔴 proxy-only — needs BYOK endpoint |
| 11 Lossy | LLMLingua, Selective_Context, GPTCache, ModelCache | Infra | 🔴 sit on the model call/payload |
| + Proxy | litellm, Portkey, optillm | Infra | 🔴 the enabler that enterprise Copilot forecloses |

### Conclusion — this INVERTS the prior "pivot to a proxy" headline

For the **enterprise VS Code Copilot** target specifically, the API-proxy pivot is 🔴 **infeasible** —
the closed extension→backend channel forecloses it. That means the whole proxy-dependent cluster
(history compaction, prompt-cache economics, model routing, reasoning budget, aggressive prompt
compression) is **off the table here**, and so are the *proxy surfaces of the competitors* —
**headroom and leanCTX only help in this host through their MCP/shell-hook surfaces, not their proxy.**

The feasible investment set collapses to four things, in robustness order:

1. 🟢 **Command-output compression** (C1 shim / C2 hook) — already tk's core.
2. 🟢 **Repo map** as `tk map` (C1 shim) — the highest-value *new* capability that survives the enterprise lockdown; MCP variant (🔵) where the org allows MCP. Port Aider's algorithm / study RepoMapper.
3. 🔵 **Code-intel retrieval via MCP** (serena / claude-context / mcp-language-server) — strong, but org-MCP-gated, so treat as opt-in, not default.
4. 🟡 **Advisory**: brevity directive (C5), MCP-server-count trim (C4/C5), `compressOutput` setting (C4).

Channel-robustness ranking for betting: **C1 shim > C2 hook (policy-lockable) > C3 MCP (org-gated) > C4/C5 advisory.** Highest-confidence new bet = **repo map via the shim**, because it needs only the one channel enterprise can't easily take away (the terminal).

---

## Verification notes

- All repo URLs were resolved live (GitHub API / page fetch) during the 2026-06-18 research pass.
- Star counts are approximate and drift; magnitudes flagged "(!)" sit on <1-year-old viral repos —
  do not quote them as hard numbers.
- Not directly fetched (lower confidence): anthropics/claude-code stars, PCToolkit (stars+recency),
  Eclipsess star count. Sourcegraph Cody main repo is 404 (only the archived snapshot survives).
- "明确不做" references point at the constraints in `docs/DESIGN.md` that this map intentionally looks past.

[rtk-ai/rtk]: https://github.com/rtk-ai/rtk
[chopratejas/headroom]: https://github.com/chopratejas/headroom
[yvgude/lean-ctx]: https://github.com/yvgude/lean-ctx
