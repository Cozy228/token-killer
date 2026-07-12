---
status: absorbed
ratified: 2026-07-12 (maintainer "批准" after a visual SHOW explainer; RC1-RC5 batch-ratified,
  RC6 previously ratified; the four named risks in Readiness accepted)
absorbed_into: M3-UI-LAYOUT-BRIEF.md (D8 amendment, D19, D20) + M4-PROJECT-UNDERSTANDING-BRIEF.md
  (§19) same day, per the maintainer's two-design-docs budget; this file is archive-only
review_after: 2026-08-02
note: Shape session 2026-07-12 — reconciling this session's four re-rulings with the ratified
  M3-UI-LAYOUT-BRIEF continuation (D7-D18) and M4-PROJECT-UNDERSTANDING-BRIEF. The maintainer
  declared the four re-rulings exceeded their comprehension; they are therefore DOWNGRADED to
  provisional here and validated by evidence, not by maintainer adjudication.
---

# M3/M4 Reconciliation Brief

## Intent

Two same-day grilling rounds (2026-07-12) produced overlapping design artifacts: the ratified
continuation D7-D18 in `docs/design/M3-UI-LAYOUT-BRIEF.md` plus the decision-complete
`docs/design/M4-PROJECT-UNDERSTANDING-BRIEF.md` (round A), and nine first-principles rulings
(round B, this session) of which four conflicted. The maintainer approved four re-rulings
verbally but then stated the questions had exceeded their understanding ("进入 unknown").
Problem: those approvals are not comprehension-backed. Desired outcome: each reconciliation
decision is either evidence-backed (model-investigated) or a genuine value judgment presented
plainly; the maintainer ratifies one Brief they actually understand. Affected: maintainer,
M3 implementers (both tracks), M4 slice plan. [user]

## Goals & success signals

- Every re-ruling is validated or refined by evidence from the real store/repo/docs, not by
  maintainer nods. [user]
- The final ratification question is answerable by the maintainer in plain language (a
  comprehension explainer precedes it). [user, "我已经开始不懂了"]
- Pending amendments to the two ratified briefs are enumerated precisely (no silent edits). [user]

## Constraints

Hard:
- C1 Claim contract + zero material false reassurance; LLM never introduces an uncited fact.
  [docs: PRODUCT-DESIGN.md §3, §6 R3]
- C2 D7-D18 and the M4 brief win by default; changes are explicit amendments, never silent
  reinterpretation. [user, conflict-disposition ruling this session]
- C3 "Never guess an anchor": ranking/similarity/LLM never selects a factual primary anchor;
  deterministic evidence only for auto-attachment. [docs: M3 brief D8]
- C4 Gate 0: M3 Guide lands/synchronizes before M4 slices. [docs: M4 brief §16]
- C5 Repo design docs are not edited until the maintainer authorizes (memory-only instruction
  stands; this Brief is a new file, permitted by the /shape invocation). [user]
- C6 Division of labor: maintainer rules only on values/priorities/risk; the model closes
  knowledge unknowns with evidence. [user, /shape invocation]

Soft:
- C7 Prefer mechanisms already ratified (proposal queue, Overlay review, host adapters) over
  new machinery. [docs: M4 brief §3-§8]

## Non-goals

- Reopening D7-D18 or the M4 brief wholesale.
- M4 connector / behavior-IR / use-case-schema detail (owned by the M4 brief).
- Any implementation; discovery ends at this Brief.

## References

- `docs/design/M3-UI-LAYOUT-BRIEF.md` D1-D18 — COPY: all of it as baseline (incl. D6, the
  deterministic attachment work order the anchors machinery lives in); this Brief amends D8's
  ladder and adds one new D-entry (reachability view, Design item 1). DON'T COPY: nothing
  else identified.
- `docs/design/M4-PROJECT-UNDERSTANDING-BRIEF.md` — COPY: §3.1 fact semantics (INFERRED+POSSIBLE
  proposal → DECLARED+LIKELY on accept), §8.2 isolated host adapter + egress manifest, §16 slices.
  DON'T COPY: nothing; slice 3 gains an internal 3a/3b split (RC3).
- Real store `~/.contexa/projects/9cd2e7eab8b4/store.sqlite` (read-only probes below).

## Decisions

RC1-RC5 are `provisional` — downgraded from this session's verbal approvals because the
maintainer retracted comprehension; they ratify in batch when this Brief is ratified. RC6 is
already ratified `[user]` (recorded verbatim from the maintainer's ruling) and is outside the
batch. "LAW" below = `PRODUCT-DESIGN.md`; "D6/D8" = Decisions in
`docs/design/M3-UI-LAYOUT-BRIEF.md`; "P41" = `FABLE-DECISION-LOG.md` P41; "Artifact 2" =
Impact Set, LAW §5.2/§8; round-B rulings are recorded in auto-memory
`m3-m4-grilling-rulings.md`.

- RC1 (provisional, refined by U1 evidence) — D8 ladder amendment: automatic deterministic
  ladder becomes `exact symbol → exact file → explicit directory path`; evidence standard
  unchanged. **Repo-level anchors are human-declared only** — absence of a path is NOT evidence
  of repo scope, so no automatic repo rung (this refines the session's "four-level" ruling).
  Humans may declare any level during review. Directory-rung boundary rule: a cited path first
  attempts unique file resolution (A1); if it instead matches an existing directory, it anchors
  at directory level; if neither, Unanchored. Rationale: U1 shows directory-only references are
  a real minority of memories (~9%) that two-level D8 would strand, and 59% of decision-log
  entries cite NO file path at all — those need the human-declared repo/directory levels, not
  an automatic rung, because repo-scope is not mechanically detectable. Representativeness
  caveat: U1 counted one repo's store; re-check on a second corpus before treating the ratios
  as product constants. Rejected: strict two-level (strands dir-scoped knowledge with explicit
  evidence); automatic repo rung (undetectable deterministically).
- RC2 (provisional, validated by U2 probe) — single LLM integration mode product-wide = M4
  §8.2 isolated host adapter; stock-knowledge anchor proposals become a proposal kind in the
  same generate pipeline. U2 refinements now part of this decision: (a) the slice builder MUST
  run a deterministic cited-reference resolution pre-pass (explicit paths/symbols extracted
  from the knowledge text, resolved to exact and relocated candidates, each marked
  resolved/not-found) — U2 showed raw FTS retrieval is the weak link (3/8 false UNANCHORABLE);
  (b) the proposal `anchor_level` vocabulary must name doc_section/decision/commit levels, not
  just symbol/file/directory; (c) slice text must not be truncated mid-evidence. Division of
  labor confirmed by probe: determinism handles exact citations, the LLM bridges
  drift/relocation/implicit references, the human confirms. Deferred: a narrow in-session
  `propose_anchor` MCP verb; trigger = 3a shows batch proposals lose decision-moment context
  (low acceptance attributed to missing context). Vocabulary note: the RC1 ladder enumerates
  deterministic code-space precedence; the proposal `anchor_level` field instead names the
  target's kind/granularity for ANY entity kind (knowledge may anchor to doc_section etc., as
  U2's correct doc anchors showed) — the deterministic evidence rule itself is kind-agnostic
  (an exact citation attaches to the cited entity whatever its kind). Rejected: dual mode now
  (second LLM write surface + injection surface without proven need); in-session only (cannot
  batch-clear the ~4k unanchored stock backlog: 2,963 doc_section + 977 concept + 104 memory
  [U1/store]).
- RC3 (provisional) — Gate 0 unchanged; M4 slice 3 splits into 3a (anchor-proposal tracer:
  generate→review→Mainline end-to-end on this repo's real unanchored knowledge; depends only on
  slice 1 substrate, may run parallel to slice 2) and 3b (use-case generation). Rationale:
  review-workflow risk surfaces on the cheapest payload; M3's knowledge layer gains anchor
  density earlier than a monolithic slice 3 would deliver it ("early" is relative to M4's
  internal ordering — 3a still starts only after M3 lands, per C4). Pre-M3 anchoring loop
  rejected on two grounds: the pipeline machinery belongs to M4 slice 3 (building it early is
  duplication) and the maintainer ratified M3-first ordering [user, this session].
  U3 verified the dependency claim with two disclosed caveats (new proposal kind needs a
  §8.4/§9 amendment; 3a's confirmed-anchor write target is the store anchors table, not YAML
  Mainline, so the tracer covers generate→review but not the exact 3b write path). Rejected:
  monolithic slice 3 (first real test of review UX lands on the heaviest payload).
- RC4 (provisional) — 3a ships under a pre-registered lightweight gate: acceptance-rate floor,
  post-confirmation wrong-anchor cap, and per-item review-time threshold — all three are
  breach ⇒ demote/stop thresholds, values set at U4 time. Running guards: published acceptance
  rate, full provenance chain (proposed-by + confirmed-by), one-command revert. M4 brief §15
  heavy gates still govern the M4 milestone release. Numeric thresholds DEFERRED to U4. Named risk: automation bias — a rubber-stamped wrong anchor becomes DECLARED
  under the maintainer's signature.

- RC5 (provisional, from U8 blindspot) — anchor records must carry their deterministic
  evidence (path/span + source revision), not only the target entity id; each `ctx sync`
  generation runs an anchor repair pass (follow `renamed-to` links — 145 exist in the current
  store [code: U13, M3 brief], re-resolve evidence); unrepairable anchors move to the
  Unanchored/needs-review queue with a reason — never
  silently dropped, never silently retargeted. Rationale: entity ids are path-derived and
  this repo has already relocated cited files once (U2); a bare `(memory_id, entity_id)`
  table rots. Rejected: leaving the current two-column table (silent orphaning contradicts
  provenance-or-silence).

- RC6 ([user], 2026-07-12) — disclosure semantics vs user-initiated egress: `local` disclosure
  never blocks the user's own explicit generate run; user-owned local content enters the
  egress manifest freely and the standard per-run manifest confirmation (M4 §8.2) is the
  entire consent mechanism — no reclassification prerequisite, no extra opt-in flags.
  Maintainer's words: the user's own model is doing the generating and sending; the tool has
  no business restricting that. Sole exception: org-sourced `restricted` content carrying
  THIRD-PARTY permissions stays excluded (those permissions are not the user's to waive;
  LAW §4 "source permissions survive aggregation"; mechanically identified via the store's
  `disclosure` fields — memory.disclosure today, M4 brief §5.4 support-level disclosure for
  connector content). Rejected: default-exclude-until-reclassified (starves 3a, treats the
  owner as a threat); gist-only slices (in all 5 of U2's anchored cases the decisive citation
  sat in the detail body, not the 240-char gist [tested: U2]).

## Design

Fat-marker synthesis of RC1-RC6. Every element traces to a Decision.

1. **Amendment set** (executes C2's "explicit amendments only"; ordering per RC3):
   - M3 brief D8 → three automatic rungs (RC1): symbol → file → explicit directory; the repo
     level exists only as a human-declared anchor outside the automatic ladder; evidence
     classes unchanged.
   - M3 brief: new D-entry for the deterministic reachability view (U7; ratified round B):
     k-hop calls/imports + co-changed from a selection, per-edge derivation labels, explicit
     not-impact/DARK wording; upgrades to the Impact page only after Artifact 2's §8 gate.
   - M4 brief §8.4/§9 → new proposal kind `anchor` (RC2/U3 caveat a): model may propose
     knowledge→code anchors chosen from slice candidates; accepted anchors write to the store
     anchors machinery (D6), not YAML Mainline (U3 caveat b, disclosed).
   - M4 brief §16 → slice 3 split: 3a anchor-proposal tracer (parallel-safe with slice 2) /
     3b use-case generation (RC3); 3a ships under RC4's pre-registered lightweight gate.
   - FABLE-DECISION-LOG → one P-entry recording this reconciliation (both grilling rounds,
     RC1-RC6, and the two briefs' own pending authority amendments list).
2. **3a slice-builder contract** (RC2 refinements, from the U2 probe):
   - deterministic cited-reference resolution pre-pass: explicit paths/symbols extracted from
     knowledge text, resolved to exact AND relocated candidates, each marked
     `resolved | not-found`;
   - FTS candidates supplement, never replace, resolved citations;
   - `anchor_level` vocabulary covers symbol / file / directory / doc_section / decision /
     commit;
   - slice bodies are never truncated mid-evidence;
   - `restricted` third-party content excluded (RC6); everything else user-owned flows under
     the manifest.
3. **Anchor durability** (RC5): anchors store deterministic evidence (path/span + source
   revision) beside the target entity id; every `ctx sync` generation runs a repair pass
   (follow `renamed-to`, re-resolve evidence); unrepairable anchors surface in the
   needs-review/Unanchored queue with a reason.
4. **Comprehension gate** (U6): before ratification of downstream work orders, the maintainer
   receives a plain-language explainer of RC1-RC6 (this Brief's ratification turn satisfies
   it for this Brief).

## Assumptions

- A1 [inferred] Extensionless path references (e.g. `src/cli`) usually resolve uniquely to a
  file, so the deterministic resolver should attempt file resolution before directory
  attachment. Invalidation: a sample shows high ambiguity (multiple matches) for extensionless
  references.
- A2 [inferred] The maintainer's earlier verbal "推荐" approvals carried no comprehension debt
  for the individual mechanisms inside the four re-ruled conflicts, only for their
  interactions. Invalidation: the ratification explainer (U6) surfaces an objection to a
  mechanism itself, not an interaction.

## Unknowns

- U1: how much stock knowledge would deterministically anchor at file vs directory vs repo
  level? → LOOKUP [closed 2026-07-12, store 9cd2e7eab8b4 + repo grep [tested]]:
  memory 104 total — 95 (91%) contain file-extension paths, 9 (9%) slash-paths only, anchors
  table 0 rows; decision log 32 P-entries — 13 (41%) mention file paths, 30 dir-like mentions
  total; docs/ 235 files, 3,164 sections — 6,975 file-path occurrences vs ~2,999 dir-only
  occurrences (866 distinct dirs; many extensionless refs likely resolve to files, see A1).
  Conclusion feeds RC1.
- U2: can an isolated host given only a typed evidence slice (gist/detail + candidate entity
  list, no repo access) propose anchors at acceptable precision? → TEST [closed 2026-07-12
  [tested: blinded-subagent probe, 8 needs-review memories, store 9cd2e7eab8b4]]: VIABLE —
  5/8 anchored, 5/5 correct under full-context audit, 0 wrong anchors (the host refused
  rather than guessed); all 3 UNANCHORABLE verdicts were caused by FTS retrieval missing
  paths the memory itself cited, not by isolation. Bonus finding: several cited files had
  been RELOCATED (docs/ → docs/archive/) — exact-path determinism fails there and the LLM
  correctly bridged the move, which is precisely the deterministic/LLM division of labor.
  Small sample (n=8) disclosed; feeds RC2 refinements and the 3a slice-builder spec.
- U3: does 3a truly depend only on slice-1 substrate (claim supports, Overlay schema, host
  adapter) and not on slice-2 (connectors, behavior IR)? → LOOKUP [closed 2026-07-12, M4 brief
  §4/§5/§16 [docs]]: CONFIRMED — anchor candidates come from the existing M1/M2 store
  (entities + FTS), no connector/behavior-IR input needed; 3a may run parallel to slice 2.
  Two caveats recorded: (a) the M4 proposal taxonomy (§8.4 allowed output, §9 Mainline
  schemas) covers only domains/use-cases — anchor proposals are a NEW proposal kind requiring
  a §8.4/§9 amendment; (b) confirmed anchors write to the store anchors table (D6 machinery),
  not §9 YAML Mainline — 3a proves the generate→review loop but NOT the exact Mainline write
  path 3b uses; tracer representativeness is partial and disclosed.
- U4: 3a gate numeric thresholds → DEFER [safe default: pre-register from U2's measured
  baseline (5/8 proposable, 0 wrong anchors, n=8) before the 3a work order is authorized;
  risk: low — thresholds are adjustable pre-registration inputs, not shipped behavior;
  trigger: drafting the 3a work order. Blindspot note: gate corpus should span ≥2 repos
  (token-killer + atlas), matching P41's two-repo substitute rule].
- U8: anchor durability — anchors table is bare `(memory_id, entity_id)` and entity ids are
  path-derived, so file moves/renames silently orphan confirmed anchors (already happened in
  this repo: docs/ → docs/archive/, per U2) → LOOKUP [closed 2026-07-12, schema + U2 probe
  [code]]: real defect class; resolved into RC5.
- U9: may `disclosure: local` knowledge bodies (memory gist/detail) enter an egress manifest
  bound for an external host model at all — and under what default? → ASK [closed 2026-07-12
  [user]]: maintainer ruling — "it is the user's own model doing the generating and sending;
  why would the tool restrict that?" Disclosure classes guard against SILENT egress and
  third-party leakage, not against the user's own explicit action. Resolved into RC6.
- U5: formal registration plan — which P-entries/D-entries/doc amendments, in which files, in
  what order → closed [synthesized into Design item 1; execution still gated by C5 until the
  maintainer authorizes doc edits].
- U6: comprehension gate — plain-language explainer of the reconciled design for the
  maintainer before ratification → closed [Design item 4; this Brief's ratification turn
  delivers the explainer].
- U7: round-B survivor "deterministic reachability view" in M3 — needs its own D-entry,
  budgets, and non-impact wording → closed [synthesized into Design item 1, second bullet].

## Readiness

**ready-with-risks** — seed, blindspot (contacts: anchors schema, memory disclosure column,
CONTEXA-DESIGN network invariant, U2 probe, P41 two-repo rule), synthesize, and fresh-reader
passes all run; every fresh-reader finding resolved by edit (2026-07-12). Provisional
decisions ratifying in batch: RC1-RC5 (RC6 already `[user]`).

Named risks accepted with ratification:
1. U2 probe is n=8, single repo — 3a's real gate numbers re-measure this (U4).
2. U1 anchor-density ratios counted one repo's store; re-check on a second corpus before
   treating them as product constants (noted in RC1).
3. The 3a tracer proves generate→review but NOT 3b's YAML-Mainline write path (U3 caveat,
   disclosed in RC3).
4. A1 (extensionless paths usually resolve to a unique file) is untested; it gates only the
   directory-rung boundary rule and carries an invalidation signal.
