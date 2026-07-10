---
status: active
review_after: 2026-07-24
purpose: ready-to-run Codex prompt — Gate-B adversarial review of the landed CONTEXA-DESIGN.md / CONTEXA-IMPL.md (plus the deferred Gate-A round-3 verification), delegated to the maintainer after the 2026-07-10 quota limit
---

# Codex Gate-B review prompt (run by maintainer)

Suggested invocation (from repo root; prompt via stdin to avoid shell backtick expansion — a
double-quoted inline prompt executed `ctx push` once via command substitution):

```
codex exec -m gpt-5.6-sol -c model_reasoning_effort="ultra" --sandbox read-only - < docs/build/CODEX-GATE-B-REVIEW-PROMPT.md
```

(If the model name is unavailable, keep the family and effort explicit — do not silently downgrade.)

---

## PROMPT (everything below goes to Codex)

You are the Gate-B adversarial reviewer of the design-reconciliation round in this repo
(token-killer, branch feat/1.0.0). Context: `PRODUCT-DESIGN.md` (repo root) is the ratified
product LAW. On 2026-07-10 the implementation registers were reconciled to it and landed at repo
root: `CONTEXA-DESIGN.md` (design register) and `CONTEXA-IMPL.md` (implementation register, with
the Drift Register embedded verbatim as Appendix A — that appendix is NORMATIVE for dispositions).
The old registers are archived at `docs/archive/CONTEXA-*-20260703.md`. Gate A (adversarial review
of the Drift Register) ran two substantive rounds — 16 then 7 findings, all integrated — but its
round-3 verification and this Gate B were deferred on a usage limit, so you carry BOTH duties.

READ: `PRODUCT-DESIGN.md`, then `CONTEXA-DESIGN.md`, then `CONTEXA-IMPL.md` (including Appendix
A/B/C). Verify against actual code wherever a claim cites file:line — spot-check at minimum:
DR-01 (packages/cli/src/mcp.ts unqualified serving), DR-06 (packages/core/src/store/shard.ts +
ingest/code/adapter.ts size/mtime clean-check), DR-18 (src/handlers/system/summary.ts
summarizeBuild), DR-32 (packages/core/src/push/block.ts header), DR-19 (src/core/history.ts +
src/core/dataDir.ts fingerprint).

DUTY 1 — Gate-A round-3 verification (was: verify revision-3 integration of your round-2 issues):
(1) A1–A6 normativity banner present and honored; (2) §8 staging header (pre-V1 containment; V1 →
minimal V2 semantics only; V2 → pre-registered non-blocking V3 shadow; distribution unauthorized
pre-V3), R-slice not an expansion trigger, DR-12 + DR-27-disclosure inside the R-slice, DR-10
bare-cut barred; ALSO judge the added O-14/dogfooding carve-out (escalated to maintainer batch
item 2, not silently assumed — the ratified P32 measurement design's arm B uses the ctx MCP, so a
strict no-local-use reading would contradict an already-ratified experiment); (3) DR-32
use-blocking + omit-facts-pre-gate + full-envelope-if-facts-return + manual-push path recorded;
(4) batch item 4 narrowed to WoZ-only-until-V1, item 5 dissolved to acknowledgement; (5) DR-18
evidence corrected to summary.ts:214-225 + receipt requirement added; (6) DR-15 reclassed
ORPHAN/RETIRED; (7) DR-29 as-built state (rename landed, ADR 0015 bans a `tk` alias, `--raw`
stdio:inherit landed) with only the remaining absorption gated.

DUTY 2 — Gate B proper, on the two landed documents:
a) Internal contradictions within each document.
b) Contradictions with PRODUCT-DESIGN.md — ZERO tolerance: LAW wins or the conflict must be
   escalated explicitly; flag anything papered over.
c) Untraceable claims — every design statement needs a LAW anchor ([LAW …]) or a code anchor
   ([code: file:line]) or a DR-anchor; flag bare assertions.
d) Dead references — pointers to files/sections that do not exist (check especially: pointers into
   docs/codemap/, docs/build/MEMORY-DECISIONS.md, the archive paths, and every [code:] anchor you
   spot-check).
e) Aspirational-scope leaks — any ungated construction described outside CONTEXA-DESIGN §8
   (Gated) / outside the register's gates.
f) Register-vs-prose divergence — where CONTEXA-IMPL §2–§7 prose contradicts its own Appendix A.
   (Known + disclosed: the prose uses freshly verified line numbers where the frozen appendix keeps
   its original citations, e.g. summarizeBuild :109-133 vs :105-133 — that pattern is intentional;
   flag only SEMANTIC divergence.)
g) The maintainer batch (Appendix A, 9 items; also OPEN.md O-31): confirm every unresolved item is
   surfaced there rather than silently decided anywhere in either document.

OUTPUT (markdown): numbered findings, each with target (file + section/DR-id), severity
(BLOCKER / MAJOR / MINOR), evidence (file:line), and the exact required change. Distinguish
"blocking defect in the documents" from "legitimate open question for the maintainer". End with
two verdicts: Gate-A-r3 = PASS / FAIL (with which of the 7 items failed), and Gate-B = PASS /
PASS-WITH-FIXES / FAIL. Do NOT modify any file.
