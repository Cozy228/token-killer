> **[2026-07-04 P28] SUPERSEDED** — execution-loop prompt bound to the retired slice DAG. Do NOT run; build route = `CTX-IMPL.md` §9 M1–M5.

# Build-Loop Goal — implement codemap-action-plan-20260620.md to completion

> This is a **looping execution** prompt. Every fire: read progress → pick the next unfinished step →
> implement it with ultracode → turn tests green → commit → update progress → continue. Until all 10
> phases (0–9) of the ACTION plan are landed, green, and committed.
> **Turn ultracode ON, but stay focused on token usage throughout** (both because this tool's goal *is*
> token optimization, and because the loop itself must be token-thrifty).

---

## 0. Fixed anchors (non-negotiable)

1. **Spec source = `docs/codemap/IMPLEMENTATION.md`**. It already breaks the 13 needs
   A–M into an ordered, dependency-aware sequence of phases 0–9, where **each step is independently
   shippable + testable** (every step carries its own "可测:" acceptance check). This loop only
   **executes** that spec; it does not redesign. On an internal contradiction or gap → log it under
   `### Deviation log`, proceed with the smallest reasonable interpretation, **do not stop to ask the user**.
2. **Target platforms**: primary = VS Code Copilot on Windows; secondary = Claude Code on macOS.
3. **Token optimization is both the product goal and the working discipline**: see §3.

---

## 1. Loop invariants (hold every fire)

- **Order = the spec's resolutionOrder**: phase 0 → 1 → … → 9; **within a phase**, by number (0.1, 0.2…).
  Exceptions exactly as the spec states: K's minimal slice (3.3) stands up right after the foundation as
  the measurement needle; L's version/packaging invariants (phase 0) are fixed first.
- **Advance exactly one minimal step per fire** (one N.M). If a step is too big, split it in the deviation
  log into N.M.a/b — still one at a time.
- **Each step = code + the runnable check named in that step's "可测:" line** (a vitest unit test or a
  self-check), which **must actually run and actually pass** to count as done. Logic without a test counts
  as unfinished (ponytail: non-trivial logic leaves one check that fails if the logic breaks).
- **Commit on each step's completion**: `feat(codegraph): <phase N.M one-liner>`; record progress, then
  start the next step. Look before touching a dirty tree.
- **Never**: bundle an API key / model egress / spend API tokens (spec strong-lean — violating it = roll
  back); add a new dependency for what a few lines can do; build an abstraction for a single implementation;
  defer the human/collaboration face to v2 (each serves='both' need ships its A side + B side in the same version).

## 2. Per-fire procedure (do this mechanically)

1. **Read progress**: the `## Progress ledger` at the end of this file. If absent, initialize it to step 0.1 not-started.
2. **Pick the next step**: the first unchecked `[ ]` N.M in the ledger.
3. **Read its spec**: go back to the action-plan, find the matching `N.M` and its "可测:" acceptance check.
4. **Implement** (via an ultracode workflow, token budget per §3): write code + the matching check.
5. **Verify**: run that step's check + `pnpm test` (the relevant subset is enough; avoid a full run unless
   necessary). **Must be green.** If not, fix it; if still stuck → log the deviation, shrink the step, retry
   once; only then stop and report.
6. **Commit** + **update the ledger** (check the step off, record one line of result/measured numbers) +
   update the deviation log (if any).
7. **Continue or stop**: more unfinished steps and this fire's budget not spent → go back to 2. Otherwise end
   this fire (the loop will wake again).

## 3. Token discipline (what "ultracode focused on token usage" concretely means)

- **Routing**: send all high-output commands through `tk` (`tk read --max-lines`, `tk rg`, `tk tree`, and
  the `tk` prefix for test/build/git). Prefer native terse forms (`git status --short`, `git log --oneline -n`,
  `git diff --stat`).
- **No re-reads**: don't re-read files/search results already in context. Don't re-read a file after editing
  to verify (Edit errors out on failure).
- **Workflow usage**: spin up a **single-phase** workflow per N.M (understand→implement→verify, trimmed to the
  step's size). Fan out only when the step is naturally parallel (multi-language extractors, multi-tool
  registration). **Scout inline first** (list files, locate the seam) before deciding the orchestration shape.
  The verify stage must adversarially check any "tokens saved" claim (spec K: measured and opportunity numbers
  are never added together).
- **Short replies**: output tokens bill ~4×. Answer with code + the minimum explanation; no preamble, restatement, or recap.
- **Measurement needle (once 3.3 stands up)**: from then on, every step touching retrieval/output economy uses
  K's A/B runner to produce the median `uncached_input_tokens` delta, recorded on that ledger line — **the
  primary metric is the uncached delta, NOT the cache-inclusive total** (spec K already overruled codegraph's
  cache-inclusive measure).

## 4. Done criteria (when the loop actually ends)

Stop only when all hold:
- [ ] Every N.M across phases 0–9 is `[x]` in the ledger, each with its check green.
- [ ] `pnpm test` fully green (product track).
- [ ] The spec's hard invariants are held by tests: no API key / no model egress (B/M); uncached primary
      metric ≠ cache-inclusive total (K); every answer carries file:line (J); measured/opportunity ledgers
      are never summed (K ledger).
- [ ] The 3.3 needle proves 3.1/3.2 (agent retrieval + output economy) yield a positive uncached delta
      (median) vs the without-tools baseline arm.

Once all green, write a one-line summary and terminate the loop (no further ScheduleWakeup).

---

## Deviation log

> Spec gaps / internal contradictions / forced minimal decisions, one line each, with a date. Empty = none.

- (none yet)

## Progress ledger

> Each line: `- [ ] N.M — <step name> — <result/measured/deviation>`. Checked = code + check green and committed.
> All unchecked initially; advance in §2 order.

### Phase 0 — version & runtime foundation (L subset, before everything)
- [ ] 0.1 — engines anchor + hard bootstrap block + env override —
- [ ] 0.2 — vendored Node 24.x bundle + shim skeleton (Windows calls node.exe directly; bundle ships FTS5) —
- [ ] 0.3 — tk Windows existing fixes as mandatory invariants (PATHEXT/EBUSY/GBK/pathToFileURL/never npx) —

### Phase 1 — physical foundation (C)
- [ ] 1.1 — open node:sqlite + PRAGMA (WAL/busy_timeout/synchronous/mmap/cache) —
- [ ] 1.2 — schema: heterogeneous nodes/edges tables + provenance + file:line/cols + hash/version columns + monotonic migration —
- [ ] 1.3 — FTS5 external-content vtable + 3 triggers + bm25 + LIKE-scan fallback —
- [ ] 1.4 — reserve meta table + nullable embedding slot (v1 doesn't write) —

### Phase 2 — populate the foundation (D)
- [ ] 2.1 — web-tree-sitter WASM loader + recyclable worker + lifecycle constants + --liftoff-only —
- [ ] 2.2 — per-language typed LanguageExtractor + core walker, emits nodes/edges, provenance='tree-sitter' —
- [ ] 2.3 — extension map (58) + .h sniff + grammar LAZY/SEQUENTIAL loads only languages present —

### Phase 3 — agent recipe + measurement needle (A + K minimal slice + G)
- [ ] 3.1 — buildContext hybrid retrieval (FTS+exact+prefix merge → BFS → adaptive chunking → Markdown, WHERE provenance='static') —
- [ ] 3.2 — output token economy (tiered char budgets 13000/18000/24000 + inline cap + leaf-verbatim + fold/skeletonize + call cap) —
- [ ] 3.3 — K minimal slice: Claude Code headless A/B runner, primary metric = uncached_input_tokens delta —

### Phase 4 — freshness (E)
- [ ] 4.1 — lazy-on-read + file_fingerprint table + optional git hook + watcher opt-in (WSL2 hard-banned) —
- [ ] 4.2 — two-level invalidation (hash fast-path + AST fingerprint ChangeType + downstream BFS + referencer set-diff + tiers) —
- [ ] 4.3 — freshness signal both-audience same-version (agent banner + structured fields; human HTML badge) —

### Phase 5 — trust contract (J)
- [ ] 5.1 — hard anchor file:line/cols + pre-emit existence gating —
- [ ] 5.2 — provenance per edge {tree-sitter/scip/heuristic} + synthesizedBy + resolvedBy/confidence —
- [ ] 5.3 — binary high/low retrieval grading + LOW honest hand-back footnote + reject anchorless RAG —

### Phase 6 — three delivery faces converge on one extension (F→H→I)
- [ ] 6.1 — tk mcp hand-rolled zero-dep stdio JSON-RPC, default 4 tools + TK_MCP_TOOLS gating + ≤9KB steering + empty env = without arm —
- [ ] 6.2 — VS Code extension LM Tool API registration + programmatic MCP, hits the same backend —
- [ ] 6.3 — self-contained single-file HTML viewer (reuse html.ts), opened by the extension, read-only —
- [ ] 6.4 — collaboration write-back: wiki.json(JSONC) + per-page provenance + proposed→accept write-back + human-fence + topo tour + impact —

### Phase 7 — intelligence generation layer (B generation layer)
- [ ] 7.1 — generation layer feeds the host agent / subscription CLI; tk only builds prompt + validates, never calls a model API; degrades to static graph + templated summary —
- [ ] 7.2 — deterministic validator always runs; LLM review only behind --review; LLM fields never become retrieval ground truth (B7 = K baseline) —

### Phase 8 — distribution finish (L full)
- [ ] 8.1 — dual channel: npm shim + optionalDependencies bundle + Releases self-heal download; standalone install script as backup —
- [ ] 8.2 — Node 22.5–23 user path --disable-warning guarded self-reentry (loop-safe); bundle 24 path suppressed via launcher flag —

### Phase 9 — full proof (K full + M governance)
- [ ] 9.1 — Job B full A/B (uncached primary + secondary metrics + omission_bug_rate + F1/FAIL_TO_PASS); Track-2 opportunity never summed in —
- [ ] 9.2 — Job A small-N task protocol (find-correct-file + onboarding, labeled "indicative"); refuse to fabricate token numbers —
- [ ] 9.3 — M cross-cutting governance overlay: M1 compression boundary + M19–M25 blacklist as lint/review checklist —
