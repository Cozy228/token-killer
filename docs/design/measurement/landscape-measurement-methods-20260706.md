---
status: frozen
review_after: 2026-10-01
---

# How comparable projects measured their token-savings claims (collector sweep, 2026-07-06)

Record-don't-judge evidence collected while grilling MEASUREMENT-DESIGN.md (P32). Question:
what measurement protocol backs each landscape project's quantitative claim? Sources: local
landscape docs (`docs/codemap/archive/research/`, `docs/reports/`, `docs/adr/0016/0023`) +
each project's own README/paper/blog via web search. Facts only; no method judgments.

**Headline finding.** The wiki/doc class publishes **no numbers at all** (landscape doc
verbatim: "Measured token savings — nobody publishes numbers; RepoDoc only logs them
internally"). Tool-class claims are overwhelmingly self-reported without a correctness
check. Only academic papers pair token savings with task-success rates.

## Per-project classification

| Project | Claim | Baseline | N | Reps | Model | Correctness checked? | Classification |
|---|---|---|---|---|---|---|---|
| codegraph (colbymchenry) | 47% fewer tokens, 58% fewer tool calls, 22% faster, 16% cheaper | MCP off | 7 repos | median of 4 | Opus 4.8 | not stated | self-reported, partial methodology |
| GitNexus | 74% tokens, 88% tool calls | grep/manual routing | 1 internal deployment (3rd-party blog; not in project's own README) | not stated | not stated | not stated | self-reported-anecdote |
| Codebase-Memory (arXiv 2603.27277) | 10× fewer tokens, 2.1× fewer calls | file-exploration agent | 31 repos | not stated | not stated | **yes — quality 83% vs 92% baseline (dropped)** | measured |
| RTK | 60–90% / "~89%" output cut | uncompressed output | "2,900+ commands" (3rd-party) | n/a | n/a | no | self-reported; README footnotes "Estimates" |
| SWE-Pruner (arXiv 2601.16746) | 39% token / 26.8% cost (abstract says 23–54%) | no-pruning agent | SWE-Bench Verified | not stated | Sonnet 4.5 | yes (<1% quality loss) | measured (inconsistent headline %) |
| FastContext (Microsoft, arXiv 2606.14066) | up to 60% token cut, +5.5% solve-rate | Mini-SWE-Agent w/o explorer | SWE-bench Multilingual/Pro, SWE-QA | not stated | 4B–30B explorer | yes (solve-rate) | measured |
| "AI Agents Spend Money" (arXiv 2604.22750) | ~1000× vs chat; 30× same-task variance; self-estimate corr ≤0.39 | chat | SWE-Bench Verified, 8 models | not stated | 8 frontier | n/a (diagnostic) | measured |
| SWE-ContextBench (arXiv 2602.08316) | 34.34% vs 26.26% accuracy (Oracle Summary Reuse), lowest tokens | No-Experience arm | 300+99 tasks, 5 settings | not stated | not stated | yes | measured |
| RAG-MCP (fintools-ai) | 76–82% tool-overhead cut | all-17-tools | 2 worked examples | n/a | n/a | no | self-reported-anecdote |
| RAG-MCP (arXiv 2505.03275, unrelated same name) | >50% prompt tokens; accuracy 43.13% vs 13.62% | full tool list | benchmark tasks | not stated | not stated | yes | measured |
| claude-context (zilliztech) | ~40% tokens "at equivalent retrieval quality" | not captured | "fixed codebases" (in-repo `evaluation/`) | not stated | not stated | implied | self-reported |
| cocoindex-code | ~70% tokens | not stated | not stated | not stated | not stated | not stated | no-methodology-found |
| Repomix | ~70% tokens | not stated | not stated | not stated | not stated | not stated | no-methodology-found |
| RouteLLM (lm-sys) | 85% cost cut @ 95% quality | GPT-4-only | MT-Bench/MMLU/GSM8K | not stated | GPT-4 ref | yes | measured |
| DeepWiki / Google Code Wiki / RepoDoc / RepoAgent / CodeWiki / OpenDeepWiki / Understand-Anything / Davia / deepwiki-open | none published | — | — | — | — | — | no numbers published |

## Notes with sources

- codegraph's own README states 7 OSS repos, on/off arms, median of 4 runs, Opus 4.8,
  re-validated 2026-06-02; token savings called "scale-dependent" (small repos ≈ even). No
  task-success gate disclosed. Our ADR 0016 already flags the numbers as "directional,
  unreproducible, up to 30× run-to-run variance" (`docs/adr/0016-measurement-before-feature.md:11-13`).
- GitNexus's 74%/88% traces to a third-party production write-up (17-agent internal
  deployment with routing prompts), not to any benchmark in the project's own docs.
- Codebase-Memory is the live cautionary case for MEASUREMENT-DESIGN §8 (M2 guardrail):
  10× token savings **bought with** a 92%→83% answer-quality drop — without a correctness
  column the headline reads as a pure win.
- SWE-Pruner's two summaries disagree on the primary figure (39%/26.8% vs 23–54%) — an
  example of headline drift when the metric isn't pre-registered.
- RTK's per-user `rtk gain` figures (e.g. "15,720 commands, 138M tokens saved") are
  self-instrumented before/after byte counts on the user's own traffic — a usage ledger,
  not a controlled A/B (same class as tk's own ledger ①).

Relevance to MEASUREMENT-DESIGN.md: the ratified protocol (paired arms + reps/median +
bootstrap CI + objective correctness gate + time-cut contamination freeze + held-out set)
has no equal among the tool-class projects surveyed; the academic papers are the only
methodological peers.
