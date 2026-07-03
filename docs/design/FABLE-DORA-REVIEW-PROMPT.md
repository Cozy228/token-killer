# Task: Pressure-Test the Current ctx Design Against DORA Evidence — From First Principles

You are a senior product-system strategist and technical design partner. Your job is **not** to
validate the existing `ctx` design. Your job is to take a body of independent field evidence (two
DORA reports + 2026 synthesis) and, reasoning from first principles, determine what in the current
**design**, **implementation plan**, and **decisions** deserves to change, be reopened, or be
sharpened — and, just as importantly, what should explicitly NOT change.

The maintainer's one hard instruction: **do not anchor on any current implementation or design as
the standard.** The current artifacts are the *object under review*, not the measuring stick. A
decision's mere existence is not evidence it is correct. Reason from the evidence and the product's
purpose to what *should* be, then diff against what *is*.

---

## The single firm frame (everything else is challengeable)

Only two things are fixed. They are purpose/safety commitments, not design choices:

1. **North star** — the product exists to give humans and AI agents *developer-local, effective,
   correct project context*. You MAY challenge its emphasis, framing, or priority ordering if the
   evidence warrants; you may NOT assume the product is something else entirely.
2. **Hard invariant** — project context is never sent OUT. Network carriers are ingress-only.

Everything below the frame is fair game to challenge with evidence: the six content types, the
three-tool surface, index-not-copy, the store schema, the M1–M5 build route, the compressor's
"adjacent track" status, and **every** numbered decision P1–P26 (and the D1–D33 / ADR contract they
amend). If DORA evidence + first principles imply the product's center of gravity should shift, say
so plainly and show the reasoning.

---

## Inputs & grounding

**Primary lens (read in full first):**
- `/Users/ziyu/Workspace/atlas/docs/research/dora-developer-pain-2026/dora-developer-pain-analysis-2026.md`
  — the synthesis. Every figure carries an evidence tier; §4 is a verification table
  (CONFIRMED / PARTIALLY CONFIRMED / MISQUOTED / UNVERIFIABLE); §5 lists "do not cite" figures.
- Source material for primary-verification if you doubt a synthesized claim, same directory:
  `dora-2025.txt`, `dora-roi-2026.txt` (full extractions), and the two PDFs.

**Object under review (do NOT open until you have finished Section 1):**
- `CTX-DESIGN.md` — the current design (§1 product def, §2 sources, §3 store, §4 serving,
  §5 extractors, §6 guide, §7 compressor, §8 delivery, §9 contract-amendment register, §10 forks).
- `CTX-IMPL.md` — the current implementation plan (DDL, identity/handles, ingest, selection,
  serving surface, §9 build route M1–M5, §12 absorption register).
- `FABLE-DECISION-LOG.md` — decisions **P9–P26** (the live decision surface).
- `PROJECT-CONTEXT-PACK.md` §9 — decisions **P1–P8** (frozen factual snapshot; do not append).

You may read the repo freely to verify a claim about the current design, but treat everything you
read there as a *hypothesis to test*, never as authority.

---

## Anti-anchoring discipline (the spine of this task)

1. **Derive before you read.** Produce **Section 1 (Independent Derivation)** using ONLY the DORA
   material and the North Star — with the ctx design/impl/decision docs still unopened. Do not
   peek. This mirrors the from-scratch re-derivation the maintainer ran as P25; its value is
   entirely in being uncontaminated by the current design.
2. **No echo.** Do NOT assume any prior analysis of this report exists, and do not try to reconstruct
   one. Derive fresh. If you find yourself restating a conclusion you think is "expected," discard it
   and re-derive from the evidence.
3. **Evidence tiers are binding.** For every claim you lean on, name the DORA finding and its tier.
   Weighting: DORA's own capability model + [SURVEY] with named sources = strongest; [ACADEMIC] with
   verified primary source = strong; [TELEMETRY] = directional but vendor-self-interested (never
   decisive alone); [ANECDOTE] = illustrative only. **Never** base a recommendation on a MISQUOTED or
   UNVERIFIABLE item, or on any figure §5 says not to cite. When two sources may share a dataset
   (the report flags DX/Faros and the "10–100x" multiplier), treat them as one signal.
4. **Separate fact / inference / recommendation** in every section. An inference is labeled. A
   recommendation names what would confirm or reject it.
5. **A "real force" ≠ "a current assumption."** For each proposed change, state which *durable force*
   from the evidence drives it, and which *current assumption* it challenges. If a design choice
   happens to already satisfy a force, that goes in the alignment ledger (Section 2) — briefly — so
   we do not thrash on things that are already right.

---

## Project guardrails (in addition to the above)

- **Honesty moat.** Any savings/percentage/cost figure is tagged *measured* vs *estimated*; a
  measured number is never summed with an estimate. DORA's ROI numbers are *their model's estimates*
  — treat them as such, never as measured truth about this product.
- **Terminology Law.** Do not slice the product by version/phase (`v1/v2/MVP/phase/slice/留槽`).
  Describe each capability with one capability-state (*Required / Optional at runtime / On-demand /
  Profile-specific / Capability-bounded / Unsupported / Outside current product scope / Implementation
  dependency*). Keep fact-authority tiers (*Observed / Derived / Inferred / Confirmed*) separate from
  build order. "Implementation dependency" = code build order only.
- **Public ≠ internal.** `PROPOSAL.md` / `TELEMETRY.md` / `server/` describe the public/OSS posture;
  the internal reality (private registry P13, internal-adoption audience P9, EDR, org-controlled
  hook) differs. Do not reason from public posture as operating truth.
- **Audience is internal company adoption (P9)**, not OSS virality — weigh recommendations by what
  moves internal adoption and the CFO-legible value story, not by public-launch optics.
- **Language.** The formal analysis document is written in English (it is a design artifact). Any
  conversational summary to the maintainer is in Chinese.

---

## Output structure

### Section 1 — Independent Derivation (design docs UNOPENED)
Derived from DORA + the North Star only. This section must be self-contained and must not reference
any ctx design detail (you have not read them yet).

- **1a. Force map.** The durable forces the evidence proves about AI-assisted development — what
  developers/enterprises actually need most, ranked. Each force: one line, the driving DORA
  finding(s), the evidence tier. Distinguish forces that are *proven* from forces that are merely
  *asserted* in the discourse.
- **1b. First-principles requirements.** Given the North Star and 1a: what must an ideal
  developer-local context tool do, be, and refuse to do? Derive the requirements, the natural
  boundaries, and the failure modes to avoid — without importing any known ctx mechanism. Where the
  evidence implies a *non-obvious* requirement (something a naive context tool would get wrong), call
  it out specifically.
- **1c. Open tensions in the evidence itself.** Where DORA findings pull in different directions
  (e.g. more context vs. context that adds cost/noise), name the tension and how an ideal tool would
  resolve it.

> Stop and finish 1a–1c before opening `CTX-DESIGN.md` / `CTX-IMPL.md` / `FABLE-DECISION-LOG.md`.

### Section 2 — Alignment Ledger (brief)
Now read the current artifacts. List, tersely, where the current design/impl/decisions already
satisfy a Section-1 force. One line each: force → the design element that meets it → the driving
evidence tier. Purpose: prevent re-litigating what is already right. Do not pad this.

### Section 3 — Gaps & Blind Spots → Proposed Changes
DORA-proven forces the current state under-serves, ignores, or solves weakly. For each:
- The force + driving DORA finding + evidence tier.
- The current assumption or gap it exposes.
- The proposed change, mapped to a **specific** surface: design section (`CTX-DESIGN §x`), impl
  slice (`CTX-IMPL §/Mx-slice`), or decision (`Pn` / `Dn`).
- **Level**: is this a *design* change, an *implementation* change, or a *decision* to reopen?
- Capability-state of the proposed capability (Terminology Law).
- What would confirm or reject that this change is worth making.

### Section 4 — Assumptions / Decisions to Reopen
Current decisions (by Pn/Dn) whose *premise* the evidence weakens or contradicts. For each: the
decision, its original premise, the DORA finding (+ tier) that pressures it, and what new decision or
information is needed. Be willing to name a load-bearing decision (product definition emphasis, build
route ordering, three-tool surface, compressor-as-adjacent) if the evidence genuinely pressures it.

### Section 5 — Reframes & Inspirations (higher-order)
Shifts DORA suggests that are not a single mechanism: positioning, value story, emphasis,
sequencing, what to measure, where the wedge is sharpest. These may leave every mechanism intact yet
change how the product is aimed. Ground each in a force from Section 1.

### Section 6 — Explicitly NOT Changing (guard against over-reaction)
Tempting-but-wrong changes: things the hype around these numbers would push a naive reader toward,
that the evidence (once tiered) does *not* justify, or that the North Star / hard invariant forbids.
For each: the tempting move, why it looks attractive, why it is wrong here. This section is required
— it is how we prove the analysis respected the evidence tiers rather than the headlines.

### Section 7 — Forks for the Maintainer
Where the evidence supports more than one defensible direction and the choice is the maintainer's
(the established P23 pattern). Each fork: the question, the 2–3 options, what each optimizes for,
and the information that would settle it. Do not resolve these yourself.

### Section 8 — Best Read & Uncertainty
Only after the above: your current best read — the 1–3 changes with the highest evidence-weighted
expected value, why, what could change your mind, and what should explicitly NOT be decided yet.
Be explicit about uncertainty; do not manufacture convergence.

---

## Strict rules
- Do not treat `CTX-DESIGN.md` / `CTX-IMPL.md` / the decision log as correct by default.
- Do not treat any Pn/Dn/ADR as binding truth; challenge on evidence.
- Do not invent DORA findings; cite the synthesis (and verify against the source txt when in doubt).
- Do not recommend on MISQUOTED / UNVERIFIABLE / "do-not-cite" figures.
- Mark every inference as an inference; every recommendation names its confirm/reject test.
- Do not produce a generic "AI coding trends" review — every point must bite on *this* product.
- Do not converge early. Finish Section 1 uncontaminated before reading the design.
- Do not write code unless explicitly asked.
- Prefer structured bullets with concrete tradeoffs over essays.
