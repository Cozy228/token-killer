---
status: active
tier: REGISTER
purpose: implementation register — the architecture AS IT EXISTS (contexa 0.3.2 wedge + greenfield core/cli, M1/M2 merged, M3 zero-code) reconciled to PRODUCT-DESIGN.md (LAW), plus the Drift Register, M-plan v2, and the refit backlog
supersedes: CONTEXA-IMPL.md (the P15–P25 first-principles implementation doc; its still-valid mechanism prose is carried here, superseded content is pointed, dropped content is reasoned — Appendix C)
death_condition: superseded by a successor implementation register explicitly ratified by the maintainer, or folded away once the R-slice + M-plan v2 land and a /gc re-baselines it
ratified: 2026-07-10 (maintainer-instructed landing "先落" — Codex Gate-B review delegated to the maintainer, prompt at docs/build/CODEX-GATE-B-REVIEW-PROMPT.md; O-31 closed; all nine rulings answered in P37)
---

# Contexa — Implementation Register (reconciled to LAW)

This register describes what is **built and merged** on `feat/1.0.0` as of 2026-07-10, and what
that code owes the product contract in `PRODUCT-DESIGN.md` (LAW). It is not a fresh
implementation design: the old `CONTEXA-IMPL.md` derived a target architecture from the P15–P25
product discussion; most of that target was then built (M1 + M2). This document folds the
still-accurate target prose together with the as-merged facts and the drift found against LAW.

**Two voices run throughout, always visually distinct:**
- **As merged:** — a fact about code on `feat/1.0.0`, anchored `[code: file:line]`.
- **Refit owed (DR-xx):** — a delta the code owes LAW, carried from the Drift Register (Appendix A).

**Precedence.** `PRODUCT-DESIGN.md` (LAW) wins on any conflict; this register is reconciled to it
and gets fixed at the next /gc if it drifts. The Drift Register (Appendix A, revision 3,
NORMATIVE) is the arbitrated source for every DR-xx; where the Phase-1 analyst evidence (C1–C6,
A1–A6) disagrees with Appendix A, Appendix A alone is normative. Detail-layer specs are
referenced, never restated (P29): `docs/codemap/` = permanent detail layer;
`docs/build/MEMORY-DECISIONS.md` = memory SoT; `docs/build/MEMORY-SYNC-SETTLEMENTS.md` = memory
mechanics; `docs/design/measurement/` = measurement authority.

**§8-staging rule (verbatim from the Drift Register header — governs all of §8):**
> Distribution staging per LAW §8: pre-V1 = no distribution, no auto-install, no decision-trust
> framing; V1 pass unlocks only building the minimal semantics V2 needs; V2 pass unlocks only the
> pre-registered non-blocking V3 shadow; general distribution is not authorized by the current LAW
> at any pre-V3 stage.

Sole pre-V1 carve-out (escalated to maintainer, Appendix-A batch Q2): the already-ratified
O-14/P32 measurement runs and the maintainer's own dogfooding — sanctioned development use,
isolated, record-only.

---

## 1. Repo layout as it exists

Three trees coexist on `feat/1.0.0`, independent by construction:

```
/  (package.json name="contexa" v0.3.2, bin ctx → ./dist/cli.js, engines >=22.18.0)
  src/                    # SHIPPING contexa 0.3.2 — the §4-LAW adoption wedge (command proxy)
  packages/               # GREENFIELD — the compiler (pnpm workspace, package version 0.0.0)
    core/                 # THE library: store/ingest/extract/select/serve/memory/push/install
    cli/                  # `ctx` bin surface + MCP server shim (cli.ts, mcp.ts)
  server/                 # telemetry AWS stack (Hono Lambda + RDS) — out of this register's scope
  tools/measurement/      # O-14/R1 self-measurement harness (§7)
  docs/                   # LAW + registers + build orders + codemap detail layer
```

- **`src/` — shipping wedge (contexa 0.3.2).** `[code: package.json:1-16]` name `contexa`,
  version `0.3.2`, bin `ctx`, published files = `dist/` + `README.md` only (`src/` is not in the
  tarball). 191 non-test `.ts` files. 58 command-handler objects wired into the router
  `[code: src/handlers/index.ts:57-113]`, four host adapters, three delivery tiers, four
  never-summed savings ledgers. This is the **§4-LAW local facet's "today's assets"** — the
  adoption wedge and evidence-delivery mechanism. Detailed in §6.
- **`packages/` — greenfield compiler.** `core` is a pure library (no long-lived processes; never
  imports `cli`); `cli` is the `ctx` bin + a thin MCP stdio server over `core/serve`. Package
  version is `0.0.0` — **unreleased** `[code: packages/cli/src/mcp.ts:32 SERVER_INFO version "0.0.0"]`.
  M1 (base speaks) and M2 (code joins) are fully merged; M3 (guide) has **zero code** (§C4).
  Detailed in §2–§5.
- **Nothing on the greenfield critical path imports from, waits on, or migrates `src/`.** The
  compressor-absorption bridge is an adjacent track, gated (DR-29, §6).

**Refit owed (DR-20 correction):** the earlier claim that "MCP is missing / command-pipe is the
gap" is wrong. The greenfield `ctx mcp` server EXISTS and is wired into install; the gaps are
DISTRIBUTION (§8 staging) + R6 semantic compliance (DR-31), not absence. A host-held
command-observation pipe that would remove the wedge's per-command spawn tax is **separate GATED
scope**, not a refit `[code: packages/cli/src/cli.ts:308-337; src/shim/hostAdapter.ts:88-197]`.

---

## 2. Store as merged (+ refit deltas)

One SQLite DB per project shard, `~/.contexa/projects/<shard>/store.sqlite` (WAL), gitignored,
rebuildable (index-not-copy). Applied forward-only via `[code: packages/core/src/store/migrate.ts]`.

**As merged — migrations 001–005** `[code: packages/core/src/store/migrations/]`:

| # | file | adds |
|---|---|---|
| 001 | `001-init.sql` | spine DDL (quoted "verbatim from CONTEXA-IMPL §2 (authoritative)") |
| 002 | `002-memory-events.sql` | append-only `memory_events` log + `drift_reason` col + F1/F6 backfill |
| 003 | `003-memory-bitemporal.sql` | `memory.valid_from` / `valid_to` INTEGER |
| 004 | `004-memory-unresolved-here.sql` | `memory.unresolved_here` INTEGER DEFAULT 0 |
| 005 | `005-memory-origin-zone.sql` | `memory.origin_zone` TEXT (null\|mainline\|overlay, derived) |

**As merged — tables** `[code: packages/core/src/store/migrations/001-init.sql]`: `entities`(id,kind,
name,locator,content_hash,source_rev,attrs,first_seen,last_verified,gen); `claims`(append-only;
subject,predicate,object,carrier,locus,method,**authority CHECK IN observed/derived/inferred/
confirmed**,at,gen); `links`(resolved current view — selection *traversal/ranking* reads THIS, never
claims, but conflict rendering dereferences the underlying claims; src,dst,predicate,method,
confidence,claim_id,verified_at,**stale**); `conflicts`(a,b,kind∈contradiction|sameAsCandidate|
stale-suspect,status∈open|resolved|dismissed); `memory`(entity_id PK,gist,detail,origin,
session_ref,**authority**,status,served_count,last_served + ALTERs above); `anchors`; `fts`
(contentless FTS5, `content=''`, `contentless_delete=1`, `tokenize unicode61 tokenchars '_$'`);
`handles`; `cursors`; `generations`(source PK,published_gen,building_gen); `meta`.
`memory_events`(ULID id,memory_id,verb,actor,reason,refs,carrier,locus,method,authority,at) with
two triggers RAISE(ABORT) on UPDATE/DELETE.

**Append-only, with one rebuild exception.** Committed markdown events are append-only durable
sources. SQLite claims/events are append-only on normal write paths, but the rebuildable memory
projection may be deleted and reconstructed wholesale by `resetMemoryCache()` (it drops the
`memory_events` triggers, deletes the events/claims/memory rows, then rebuilds from the committed
files) `[code: packages/core/src/store/store.ts:618-640]`.

**As merged — conformance base (DR-08, CONFORMS):** contentless FTS (index-not-copy);
claims/links separation; conflicts stored side-by-side never squeezed; RECONCILING serves the
previous published gen (fail-open); `assertNoEgress` + zero network calls, measured
`[code: packages/core/src/serve/egress.ts (assertNoEgress); DR-08]`. These are LAW-conformant
[LAW art. 1/2/4; R3/R5] and are the base the refit builds on.

The store **survives R2 as a rebuildable accelerator substrate** [LAW R2 — indexes are TTL
accelerators, never asserted truth]. The refits below make it *safe to serve claims from*, not
merely *fast*.

### 2.x Refit deltas (R-slice — precondition for serving any factual claim)

**Refit owed (DR-02) — derivation/confidence split** [LAW §3 schema; §7.1]. Every persisted
`authority` field (claims CHECK enum, memory rows, `memory_events`, committed memory/decision line
grammar, TS types) must split into `derivation ∈ {OBSERVED,DECLARED,INFERRED}` +
`confidence ∈ {CONFIRMED,LIKELY,POSSIBLE}`. Backfill from carrier+method+create-event actor —
never from the legacy 4-value enum or authorship alone. `CONFIRMED` requires independent
corroboration; `LIKELY` only where the source is authoritative for that claim type (§7.1 matrix);
ambiguous legacy rows stay `unknown` and never render as likely facts. Note: production writes
`origin=remember`, not `human-note` — no mechanical human-authored backfill exists
`[code: 001-init.sql:31 authority CHECK; store/types.ts:21; remember.ts:54,365-399]`.

**Refit owed (DR-03) — computed `status` view** [LAW §3 status enum]. Derive per-claim
`status ∈ {resolved,conflicting,stale,unavailable,restricted,unknown}` as a computed view over the
scattered `links.stale` / `conflicts` / `memory.status` signals. Documented memory-status
projection: active→resolved; needs-review(drift)→stale; needs-review(pending)→unknown;
unresolvedHere→unavailable; `restricted` reserved until DR-05 lands [DR-03].

**Refit owed (DR-04, serve-blocking) — freshness wiring** [LAW §3 freshness; art. 1; R2]. Hash-drift
detection exists but is **not** a freshness guarantee: drift fires *after* selection, selection
ignores `links.stale`, search does no read-through, detected drift is never rendered
`[code: store.ts:1008-1015; subgraph.ts:64-96; packages/core/src/serve/render.ts:54-65]`. Refit (full text Appendix A):
exclude/downgrade stale links in traversal+ranking; render freshness as unknown-until-reverified;
honest header (index-catchup, not content freshness); per-source decay class for non-file connectors.

**Refit owed (DR-06, serve-blocking) — D32 generation-identity tuple** [LAW §3; D32/ADR0040]. As
merged, a published generation is a **single per-source integer**; repository revision, worktree
digest, schema version, and analysis-policy version participate in neither the dirty-check nor
generation identity, and all worktrees share one shard — so a clean dirty-check can reuse rows built
under another worktree/policy and serve them `fresh` `[code: shard.ts:4-12; store.ts:855-890;
code/adapter.ts:168-181]`. Detail: `docs/codemap/impl/E-freshness-incremental.md:73`. Refit: bind
every published generation to the full D32 tuple **(repository revision, worktree digest, schema
version, analysis-policy version)** per ADR 0040:18-25; reject/rebuild on any component mismatch.

**Refit owed (DR-10) — `valid_from`/`valid_to` bitemporal** [LAW §3 bitemporal]. Columns are
written (migration 003) but read by nothing in select/serve `[code: packages/core/src/store/
migrations/003-memory-bitemporal.sql; no reader in select/serve]`. Provide an equivalent as-of /
bitemporal recompute path (P37 ⑧ EQUIVALENT-SCHEME — wiring the columns is not required); a bare
cut would drop LAW §3's bitemporal promise → LAW-side escalation, not a local decision (P37 ⑧).

**Refit owed (DR-09, ORPHAN) — dead usage columns.** `served_count` / `last_served` have no writer
`[code: packages/core/src/store/migrations/001-init.sql:62-63]`; research ruled the usage signal OUT. Cut them (closes O-07 as "cut"
if ratified).

---

## 3. Ingestion as merged

**As merged — adapter framework** `[code: packages/core/src/ingest/adapter.ts:53-62]`.
`SourceAdapter{id, cost, dirtyCheck(store):<20ms, ingest(store,dirty,budget):resumable}`.
`SourceId = git|code|docs|memory|github|jira|confluence`; only **git/code/docs/memory** are
registered (github/jira/confluence reserved for M4) `[code: ingest/registry.ts:22-35]`. Registration
order git→docs→memory→code; cost-ordered ingest is cheapest-first (git 2, docs 6, code 5; docs runs
after code on a cold full sync so symbols exist for mention resolution) `[code: code/adapter.ts:151;
docs.ts:81]`.

**As merged — catch-up / RefreshEngine** `[code: ingest/refresh.ts]`. `CATCHUP_GATE_MS=3000`;
first serve call per process is time-boxed — if reconcile isn't done, serve anyway marked
RECONCILING and finish in the background. `SourceState = clean|complete|partial|deferred|skipped|
error`; `RefreshReport{status:fresh|reconciling, sources, pendingSources, frozenSources}` — staleness
is structured envelope fields, never prose. Per-file dirty detection: (size,mtime) match
short-circuits; on mismatch a blake2b content-hash confirms real change vs cosmetic touch. Single
DB-backed writer lease (no daemon).

**As merged — ignore-set** `[code: ingest/ignore.ts]`. `DEFAULT_IGNORE_DIRS` ~65 entries +
patterns (`.egg-info`, `cmake-build-*`); `MAX_FILE_SIZE = 1 MiB`; `docs/` explicitly NOT excluded
("docs are a first-class source"). Seeded from `docs/codemap/impl/D-language-coverage.md:618`
(itself lifted from codegraph). `.gitignore` honored via `git ls-files` fast path
`[code: docs.ts:561-562]`.

**As merged — code source (M2)** `[code: packages/core/src/{extract,ingest}/code/*]`:
- Symbol id `sym:<repo-rel-path>#<qualified.name>[~<disambig>]`; span/content-hash are attributes,
  never id. **Rename changes the symbol id.** Arity participates only in overload disambiguation;
  for a uniquely named symbol, an arity change preserves the id and is surfaced as
  `signature-changed` (whitespace shift → same id) (G-9)
  `[code: extract/code/extract.ts:206-258; extract/code/symbol.ts:6,58-61]`.
  `SymbolKind = function|method|class|const`.
- Tier-1 languages: TS/TSX/JS, Python, Go, Java, Rust, C# via `web-tree-sitter@^0.25.10` + runtime
  `.wasm` grammars resolved from the `tree-sitter-wasms` dependency
  `[code: extract/code/languages.ts:13-21]`.
- Fingerprint `ChangeClass = none|cosmetic|structural`; undefined prev → structural (conservative)
  `[code: ingest/code/fingerprint.ts]`.
- Call graph: `caller-sym --calls--> callee-sym` only for local/project resolution (never
  builtin/unknown/ambiguous/cross-language); confidence 1.0 local / 0.85 project; self-recursion
  excluded `[code: ingest/code/callGraph.ts; code/adapter.ts:594-662]`.
- SCIP: root `index.scip` consumed if present; fail-open success-shaped; decoded fully and buffered
  before any write; authority ladder upgrades never downgrades; SCIP `carrier="scip"`,
  `authority="observed"` `[code: ingest/code/scip/consume.ts]`.
- Worker model: exactly ONE recyclable worker (recycle every 250 files, timeout base 10s + 10s per
  100 KB, terminate-after-reject on wedged WASM); degrades to in-process core; **today runs the
  worker from `.ts` source via `--experimental-strip-types` (dist worker not bundled — DR-26/O-12)**
  `[code: extract/code/codeParser.ts:148-151]`.
- Incremental triad `[code: ingest/code/incremental.ts]`: 1-hop boundary expansion, shadow
  detection, shrink guard (success-shaped refusal, previous gen stays served).

**As merged — docs scan** `[code: packages/core/src/ingest/docs.ts]`. Classification precedence:
frontmatter `type:` → path convention (`docs/adr|decisions/`, `*.adr.md`) → H1 heuristic → default
`doc`, disclosed via `classified-as` claim `[code: docs.ts:174-190]`. Two-tier path-mention
resolution (exact 1.0 / unique-basename 0.6); unresolved doc-target mentions → `mentions` claim +
`never-resolved` stale-reason claim + `stale-suspect` conflict; unresolved code-target mentions wait
for the code source `[code: docs.ts:341-405]`. `resolveKeyLinks`: `amends`/`supersedes` frontmatter
→ explicit-key observed links.

**O-16 / DR-27 — the docs blind spot.** `resolveSymbolMentions` (added slice 2d) DROPS unresolved
symbol mentions with a silent `continue` — no claim, no conflict, no durable record — AND nothing
re-runs docs when new code symbols are later published `[code: docs.ts:417-463, esp. :438]`.

**Refit owed (DR-27, split):**
- *pre-V1 disclosure half (proceeds now):* suppress/flag the affected relation and render a **named
  blind spot** [LAW art. 4]; freeze the design + fixtures now.
- *gated construction half (behind V1):* durable unresolved-mention persistence + a cross-source
  re-resolution seam is NEW substrate construction — "needs ratification, not a bolt-on"
  `[code: OPEN.md:21 (O-16)]`. Touches the claims/conflicts lifecycle: claims=evidence,
  conflicts=state — never gate behavior on append-only rows.

---

## 4. Memory subsystem as merged

Six slices merged on `feat/1.0.0` (event-sourced, file-backed, git-as-sync). Design SoT:
`docs/build/MEMORY-DECISIONS.md`; mechanics: `docs/build/MEMORY-SYNC-SETTLEMENTS.md` — referenced,
not restated (P29). This subsystem is the concrete **local facet** and is largely LAW-conformant as
local-facet mechanics [LAW §4; DR-11 CONFORMS scoped].

**As merged — event log + fold** `[code: packages/core/src/memory/fold.ts]`. Every write is an immutable event appended to a
committed (or overlay) markdown log; `memory.status` is a rebuildable CACHE of the fold over
`memory_events` in total order `(at, ULID)` `[code: fold.ts:66-104]`. Verbs: create/confirm/retire/
review/supersede/resolve-conflict/dismiss. E5 collision (both retire+supersede) files a
`contradiction` conflict `[code: fold.ts:112-177]`.

**As merged — zones** `[code: fileStore.ts:29-45]`. `MemoryZone = mainline|overlay`. Mainline:
`.contexa/memory/{log.md,decisions.md,details/<ulid>.md}` (committed, `merge=union`). Overlay:
`.contexa/{memory.local.md,decisions.local.md,details.local/}` (gitignored). E4 per-repo opt-out
(`commitMemory:false`) redirects every mainline write to the overlay; reads still address the
literal zone `[code: fileStore.ts:70-79]`.

**As merged — drift / anchor-sig** `[code: packages/core/src/memory/reindex.ts; anchoredAt.ts]`. `MemoryDriftReason = target-removed|
signature-changed|body-changed` on `memory.drift_reason` (derived, per-checkout, never an event,
never committed). Absent-anchor split via `anchored-at` + `git merge-base --is-ancestor`:
ancestor→target-removed(drift); not-ancestor→unresolved-here (import hint, never stale)
`[code: anchoredAt.ts:44-67; reindex.ts:484-496]`. Optional `anchor-sig` content-hash token
`{h,a}` re-derives present-target drift at full reindex/fresh clone; `confirm` records `clearedDrift`
+ `confirmSigs` in committed bytes so reindex doesn't undo a human recovery
`[code: serialize.ts:46-57; remember.ts:797-810]` (O-18 closed).

**As merged — remember surfaces + caller split** `[code: packages/core/src/memory/remember.ts]`. `RememberInput.surface ∈
{cli,mcp,local}` is REQUIRED (a caller that forgets its surface is a compile error, never a silent
commit). `ROUTE_FOR_SURFACE`: cli→{mainline,active,actor cli}; mcp→{overlay,needs-review,actor
agent}; local→{overlay,active,actor cli} `[code: remember.ts:39-46,78-97]`. `MemoryOrigin =
host-import:<host>|remember|remember-local|human-note`; `remember-local` is push-excluded
`[code: push/rank.ts:56,59]`. `confirm` promotes an overlay-only create to mainline (D3);
non-confirm verbs on an overlay-only row route to overlay (O-21) `[code: remember.ts:715-810]`.
CLI `LIFECYCLE_VERBS = {confirm,retire,review}` — **`supersede` exists in the event enum but is not
a CLI subcommand** (DR-30 candidate) `[code: packages/cli/src/cli.ts:118-122]`.

**As merged — push/pull** `[code: packages/core/src/push/; packages/core/src/memory/catchup.ts]`. `PushConfig{pin,veto,commitMemory}` from
`.contexa/push.jsonc` (shared) merged with `.contexa/push.local.jsonc` (overlay) for the
`ctx push --local` display view only; the **placed** block is built from the shared config alone
(byte-identical across peers). `PUSH_MAX_BYTES=1024`, `PUSH_MAX_GOTCHAS=6`. Catch-up routes by
surface intent (remember-local / needs-review → overlay) `[code: catchup.ts:128-134]`.

**As merged — secret guard (E4)** `[code: secretGuard.ts:29-85]`. 9 deterministic regex classes run
before the committed zone → success-shaped withheld-to-overlay refusal (no LLM/network, never
isError). Runs on the mainline write path only.

**As merged — doctor E8 + git-depth advisory** `[code: packages/core/src/install/doctor.ts]`. `checkMemoryOps` (read-only:
reviewQueue, oldest-review age, dangling/orphan sidecars) + `checkGitDepth` shallow-clone advisory
(always ok:true).

**As merged — identity dedup (D1, slice 6)** `[code: packages/core/src/memory/dedup.ts:108-141]`. `identityCandidatePairs` derives
near-dup pairs from committed gists alone (entropy floor 2.5 bits, differing-number veto, Jaccard
≥0.6), deterministic across long-lived peer and fresh clone; files OPEN `sameAsCandidate` conflicts
at reindex (never destructive merge) `[code: dedup.ts:108-141; reindex.ts:360-424]`. `origin_zone`
provenance stamped per-checkout at reindex.

### 4.x Refit deltas (memory)

**Refit owed (DR-12, scoped) — override expiry** [LAW §3 "local overrides expire"]. As merged,
override precedence has only a 90-day soft decay; an override never loses eligibility
`[code: ops.ts:6,24; rank.ts:43-68]`. Downgraded per Gate A: expiry = loss of current
precedence/eligibility, NOT deletion (no contradiction with append-only). Scope to *semantic* local
overrides (e.g. `remember --local --supersedes`): add an expiry/re-verification trigger; expired
overrides surface as stale (flagged, retained). Trigger/cadence = implementation choice.

**Refit owed (DR-05, serve-blocking) — restricted-evidence enforcement** [LAW §3 restricted/
disclosure; §4 "explicit and classified"] — see §5.

**As-built, gated (DR-13):** the cross-checkout collaboration layer (push/dedup/catchup) was built
pre-pilot. Keep as-built, reliability maintenance only; **no further broad expansion until FP-L
shows behavior change** [LAW §8 ladder].

---

## 5. Serving as merged

**As merged — MCP protocol** `[code: packages/cli/src/mcp.ts]`. stdio, protocol
`2024-11-05`, server `{name:"ctx",version:"0.0.0"}`. Three tools: `context{ref?,task?,handle?,
budget?}`, `search{query!,kinds?}`, `remember{note!,detail?,anchors?,supersedes?}`. JSON-RPC:
initialize/ping/tools.list/tools.call; unknown method -32601, parse -32700, unknown tool -32602;
tool faults surface as `isError:true` content, never a dead transport. `assertNoEgress` runs at
`runMcp()` entry before opening the store `[code: packages/cli/src/mcp.ts:213; serve/egress.ts]`.

**As merged — envelope / render** `[code: packages/core/src/serve/render.ts]`. ONE markdown text block.
Header `# ctx · <subject> — <freshness>`; `SECTION_ORDER = [subject,code,decisions,history,memory,
conflicts]`; section labels are bold+codespan (never ATX). `truncated` (budget-capped subset) vs
`partial` (a read-through failed — do not treat as clean) kept distinct. File-backed kinds numbered
`N⇥code` like the host Read tool; ambiguous refs return ALL candidate definitions; recoverable
misses are success-shaped guidance, never isError.

**As merged — selection / ranking** `[code: packages/core/src/select/engine.ts:69-117; select/rank.ts]`. Composite score =
PPR over subgraph (teleport = normalized seed weights) × post-multipliers, RRF-fused (K=60) with raw
lexical rank, × heatBoost × authority. Time decay `exp(-age/90d)` for history/memory only; code never
decays. `search()` = stages 1–2 + flat ranked render (no PPR). Visibility gate: entity visible iff
`gen ≤ published_gen` of its owning source; retired memory hard-excluded from default pull.

### 5.x Refit deltas (serve)

**Refit owed (DR-01, GATED distribution) — unqualified serving.** The persisted M1/M2 graph is
served by the greenfield MCP as ordinary tool results with the tool description "Start any task
here" and NO accelerator/unvalidated qualification `[code: packages/cli/src/mcp.ts:40; packages/cli/src/cli.ts:308-337 (install
auto-registers MCP + push block)]`. KEEP the rebuildable substrate. Pre-V1 containment: no
distribution, no auto-install, no decision-trust framing; responses carry an
accelerator-not-validated disclosure; only the O-14/dogfooding carve-out runs it at all. Expansion
follows the §8-staging rule (V3 is the first live-host stage). Completing the R-slice does NOT
authorize distribution.

**Refit owed (DR-07 + DR-31, serve-blocking) — minimum claim envelope.** The envelope cites locators
but no per-claim trust data reaches the consumer; a `[handle]` is navigation, not a source anchor;
the MCP is a Markdown transport, not R6's same-claim machine interface (no caller scope; no per-claim
evidence/observed-time/derivation/confidence/status/freshness/disclosure; no cited UNKNOWN/restricted
outcomes) `[code: packages/core/src/serve/render.ts:84-92; packages/core/src/select/types.ts:25-40; packages/cli/src/mcp.ts:174-187; packages/core/src/serve/types.ts:1-5]`.
Refit (full text Appendix A): define + serialize the **minimum claim envelope** under the caller's
scope, rendered tersely. This minimum claim envelope is the binding base for every consumer; under
P37/O-25 the retained or reworked M3 projection DTOs are unified with it, and historical structs may
be reused only where the re-scope justifies them (DR-15). **Gate factual machine serving until it is
serialized** [LAW R6; art. 2/3; P37].

**Refit owed (DR-05, serve-blocking) — restricted evidence.** No-egress + overlay placement are NOT
restricted-evidence enforcement: secret-shaped/restricted content stays indexed, searchable, and
renderable via MCP (secret guard scans the mainline path only; MCP notes land overlay unscanned)
`[code: remember.ts:365-486; visibility.ts:56-64]`. Refit: a real `restricted` status + `disclosure`
class (default local); exclude restricted bodies (and relationship-derived leaks) from FTS/render/MCP;
emit only a cited withheld/unavailable outcome.

**Refit owed (DR-32, use-blocking) — push-block claim posture.** The always-loaded block renders
uncited memory gotchas into host instruction files, its header claims "with provenance" +
"Start tasks with the `context` MCP tool", and manual `ctx push` bypasses any install-side gate
`[code: packages/core/src/push/block.ts:35-112; packages/cli/src/cli.ts:273]`. Pre-gate: OMIT factual gotchas and drop/reword the "with
provenance" header to non-claiming text (tool instructions may stay). If factual gotchas ever return,
each carries the FULL minimum claim envelope + explicit omission disclosure [LAW art. 3].

---

## 6. Shipping surface as it exists (the §4-LAW wedge)

`src/` is contexa 0.3.2: a command proxy that filters/recovers noisy command output and measures the
saving. Under LAW it is the **local facet's adoption wedge and evidence-delivery mechanism** [LAW §4
today's assets]. Condensed from C1.

**As merged — filter / recovery / quality gate.** `routeCommand` always returns a handler
(generic fallback); `routeSpecific` gates compress-vs-passthrough and skips `--version`/`--help`
probes `[code: src/router.ts:8-38]`. 58 handler objects, 31 on the `defineHandler` scaffold
`[code: src/handlers/index.ts:57-113; define.ts]`. Central quality gate `makeFilteredResult`
computes an inflation budget, sniffs undeclared omission, and **reverts to raw when a handler
produced worse output than raw (fail-open)** `[code: src/handlers/base.ts:91-113]`. Raw snapshots
(`0o600`, atomic) back the recovery pointer `[code: src/core/rawStore.ts]`. `--raw` streams
byte-verbatim via inherited stdio `[code: src/cli.ts:314-318; src/executor.ts:637-640]`.

**As merged — hosts / tiers.** 4 hosts (claude-code, copilot-cli, vscode, unknown), ladder
Hook>Shim>Injection `[code: src/shim/hostAdapter.ts:88-204; detect.ts]`. For VS Code the shim is
**primary** and the hook is **additive** (VS Code Copilot's PostToolUse cannot compress — no
`modifiedResult`), so the plain Hook>Shim>Injection precedence does not hold there. PATH shim wraps only
present binaries (`NEVER_WRAP` denylist for interpreters) `[code: src/shim/install.ts,programs.ts]`.
Guidance doc `CTX.md` `[code: src/shim/guidance.ts]`.

**As merged — doctor.** `ctx doctor [--fix]`: repairs an existing install (never auto-installs a
never-set-up host), heals records, report-only on host session data `[code: src/shim/doctor.ts]`.

**As merged — inspect / optimize.** `ctx inspect` scans the developer's AI setup for missed
token-saving opportunities → HTML report `[code: src/inspect/cli.ts]`. `ctx optimize` consumes the
persisted bucket, plans static-context patches, read-only by default `[code: src/context/
optimizeCli.ts]`.

**As merged — ledgers / telemetry.** Four ledgers displayed side-by-side, **NEVER summed**
`[code: src/core/ledger.ts:3-9]`; session dedup in a dedicated `dedup-events.jsonl`, excluded from
ledger ① `[code: src/core/dedupLedger.ts]`; telemetry allow-list enforced in code, opt-in, cold-path
only `[code: src/telemetry/build.ts,dispatch.ts]`.

**Refit owed (DR-18, split):**
- *CONFORMS (wedge mechanics):* fail-open gate, recovery, telemetry, ledger separation [DR-18].
- *DOES NOT conform as evidence [LAW R3; art. 3]:* `summarizeBuild` derives a **success verdict from
  keyword counts with no exit code** — `if (errors === 0 && warnings === 0) result.push("[ok] Build
  successful")` — so a real non-zero build can be reported successful **(verified in source)**
  `[code: src/handlers/system/summary.ts:105-133, verdict line :126; coexistence path :214-225]`; and normal in-budget summaries
  carry no immutable receipt/anchor `[code: base.ts:221-230 — pointer only on declared-omission]`.
  Refit: (a) never emit a heuristic success verdict — wire the exit code through, neutral counts
  otherwise; (b) every synthesized summary that asserts facts carries a raw receipt/anchor or stops
  asserting. The exit-code defect is filed as an OPEN candidate (report-only here; Appendix B).

**Refit owed (DR-19, first FP-L slice) — history isn't claim-shaped.** History records are
proto-claims: `project_fingerprint` = path hash (an accounting id), no commit/worktree binding, no
VALID/STALE recompute `[code: src/core/history.ts:18-45; dataDir.ts:115]` [LAW §4 "still valid?";
§5.4; §3 keying]. Strictly the first FP-L slice, NOT a general retrofit. Rename/comment the
fingerprint field.

**As merged, ORPHAN (DR-21):** `ctx debug` / `ctx support` — no-egress field plumbing; tag
"maintained utility, no scope growth"; death condition = superseded by facet tooling [DR-21].

**Refit owed (DR-20 correction) — see §1.** MCP exists in the greenfield tree; the wedge's per-
command spawn tax is a separate GATED command-pipe scope, not a refit.

---

## 7. Measurement state

Authority: `docs/design/measurement/MEASUREMENT-DESIGN-V2.md` (P38; supersedes P32 as recorded in
its §7). The v1 grids are evidence only and authorize no verdict. Run E0 first; fix O-32/O-33; only
a passing E0 unlocks E1/E2.

**As merged — harness inventory** `[code: tools/measurement/]`. The v1 harness (mine-tasks /
make-sandbox / run-cell / grade-cell / analyze / run-grid / lib + run-cell-codex / run-grid-codex +
HANDOFF / task-bank) and the Codex-protocol scripts (run-cell-codex-protocol / run-grid-codex-protocol
/ analyze-codex-protocol) are **absorbed and committed with P38 F4** — the earlier "uncommitted
protocol scripts" description no longer holds.

**v1 grids = evidence only (no verdict).** The v1 A/B design (two arms A = without-ctx, B = pull+push
with-ctx; N=10 tasks × 3 reps × 2 arms) measured *availability*, not *use*: organic ctx adoption was
3/20 in the B arm, the uncached-M1 dynamic range collapsed (atlas bootstrap CI ∋ 0 → HOLD), and the
"codex 100% void" report was STALE (MCP transport failures; post-rerun truth 48 pass / 13 fail /
5 void). These grids are retained as evidence and authorize no verdict [P38 §0].

**v2 ladder (P38) — E0 → E1 → E2.** E0 is a NEW instrument benchmark that runs FIRST with no agent
in the loop (is the tool reliable/relevant enough to be worth a call?); it must pass — and the
product defects O-32 (300 s MCP `context` timeout) + O-33 (misleading "use task mode" guidance and
weak retrieval relevance) must be fixed — before any E1 (adoption) / E2 (value-given-use) grid spend.
E2 value-given-use is the O-14 headline; E1 adoption is reported as a qualifier; codex is demoted to
an E1-only secondary runner (no token claims) [P38 F1/F4; V2 §1].

**Refit owed (DR-25, superseded by P38) — measurement redesigned, not simply committed.** R1
self-measurement is sanctioned [LAW art. 8; O-14], but the v1 results are NOT committed as a verdict:
the measurement is REDESIGNED per `MEASUREMENT-DESIGN-V2.md` (E0-first ladder). Commit measured
numbers only, and only for a stage that passes its own bar [P38; O-14].

**Immediate next step (DR-24, V0) — O-22.** Freeze & pre-register the WoZ stage-1 protocol (question
taxonomy, materiality, cutoff, denominator, truth-panel composition, tie-break, adjudication window)
as a standalone frozen doc BEFORE running validation-ladder stage 1 `[code: OPEN.md:26]`. LAW §8.1
names the sample (~12 PRs) and kill bar (<9/12) but leaves taxonomy/tie-break/window/panel
composition undefined — that is exactly O-22's payload.

---

## 8. M-plan v2 (the route, reconciled to LAW)

The route is gate-first: LAW §8's validation ladder decides what gets built, and the **§8-staging
rule** (reproduced in the header) governs every expansion. M1/M2 are built; the **R-slice** is the
serve-integrity precondition; V0→V3 is the ladder; M3 is RECAST/FROZEN pending O-25 (retirement
rejected, P37); M4/M5 are re-scoped.

| element | disposition | gate / justification | acceptance criteria |
|---|---|---|---|
| **M1 local-facet wedge** | KEEP + RETROFIT | may-proceed (reliability/wedge correctness) | already merged; retrofit acceptance folded into R-slice + DR-19 |
| **M2 code substrate** | KEEP + RETROFIT | may-proceed (substrate correctness; no decision-trust claims pre-V1) | already merged; D32/incremental refits owned by R-slice |
| **R-slice "claim-serving integrity"** (NEW) | RETROFIT on merged code only; groups DR-01/02/03/04/05/06/07/10/12/27-disclosure/31/32; adds NO new breadth | starts after the Gate-B review (P37 ③); may-proceed (wedge correctness); completing it does NOT authorize distribution — §8-staging governs | see R-slice acceptance below |
| **V0 — O-22 protocol freeze** | NEW, immediate next step | §8.1 stage-1 precondition; zero code | O-22 frozen doc exists with taxonomy/materiality/cutoff/denominator/panel/tie-break/window pre-registered |
| **V1 — WoZ shadow (stage 1)** | NEW | gated on V0 | ~12 real non-trivial PRs, hand-operated read-only queries at first-review cutoff, independent truth panel; **KILL if <9/12 reach the pre-registered coverage bar or on ANY material false reassurance** |
| **FP-L — ctx continuity pilot** | NEW, may proceed early | LAW §9 survivor; first slice = DR-19 claim-shaping | continuity card built on OBSERVED command-boundary evidence; pre-registered behavior-change gate met (avoidable reruns / stale reasoning reduced) |
| **M3 `ctx guide`** | RECAST per **P37** (retirement rejected; LAW §11) | On-demand runtime-created LOCAL read-only render surface over cited claims — not a standing destination; lands AFTER the R-slice; inherits DR-07/31 envelope + DR-01 disclosure + DR-17 §3-provenance; Impact-Set visualization page ships only WITH Artifact 2 (V1→V2 gate) | Work-order re-scope = O-25; kernel DTOs unified with the DR-07/31 envelope; M3 docs stamped `status: frozen` until re-scoped |
| **M4 → org connectors** | RE-SCOPE (DR-23) | sequencing (P37 ④): last, or locally-verifiable git carriers first (e.g. GitHub commit history), GitHub/API later; snapshots as TTL+receipted accelerators, revalidated before trigger-time bitemporal compilation; breadth gated on V1/V2 | ingress-only; caller identity/disclosure propagated; connector absence = named blind spot; live-reads-only NOT required |
| **V2 — backtest (stage 2)** | NEW | gated on V1; produces §7.2 thresholds | ~100–150 historical PRs regenerated as-of PR-open; scored vs realized breakages; claim-sample truth-at-time audit; **outputs the calibrated precision/recall bars** |
| **FP-O — Atlas concierge pilot** | NEW | gated: needs V1 + connectors | pre-registered gate (resolved org facts change real decisions) |
| **V3 — live shadow (stage 3)** | NEW | gated on V2 | 4 weeks non-blocking; no review-latency degradation, zero stream-fidelity/secret incidents, no stale-shown-as-valid |
| **M5 → measurement + wedge perf** | RE-SCOPE (DR-25/DR-28) | M3 guide-perf items RECAST/FROZEN pending O-25 (moot as written) | measurement finished/committed per P38; local wedge perf gates |
| **O-14 R1 self-measurement** | KEEP — REDESIGN then commit (P38) | sanctioned; DR-25 superseded by P38 (measurement design v2, E0-first ladder) | v1 grids = evidence only; run E0, fix O-32/O-33, then E1/E2; commit measured numbers only for a passing stage |
| **Compressor absorption** | SPLIT (DR-29) | fidelity fixes proceed; rebrand/migration gated on FP-L | see DR-29 in §9 |

**R-slice acceptance criteria (concrete, checkable):**
1. Every persisted `authority` field is split into `derivation` + `confidence` with a documented
   backfill rule; ambiguous legacy rows resolve to `unknown` and never render as a likely fact
   (DR-02). Property test: no `CONFIRMED` without independent corroboration.
2. A computed per-claim `status` view exists with the documented memory-status projection (DR-03).
3. Selection + ranking exclude/downgrade stale links; the served header names index-catchup (not
   content freshness); claim freshness renders as unknown-until-reverified (DR-04). Test: a
   drift-flagged claim never renders as `fresh`.
4. Every published generation is keyed to the full D32 tuple; a worktree/schema/policy mismatch
   rejects/rebuilds instead of reusing rows (DR-06). Test: two worktrees sharing a shard do not
   cross-serve.
5. An equivalent as-of recompute path exists (P37 ⑧ — wiring `valid_from`/`valid_to` is not
   required); a bare cut is escalated, not taken (DR-10).
6. The minimum claim envelope DTO is defined and serialized over MCP under the caller's scope, with
   per-claim evidence/observed-time/derivation/confidence/status/freshness/disclosure + cited
   UNKNOWN/restricted outcomes (DR-07/DR-31). **Gate: no factual machine serving until this passes.**
7. A real `restricted` status + `disclosure` class excludes restricted bodies (and relationship
   leaks) from FTS/render/MCP; MCP-surface notes are secret-guarded (DR-05). Test: a secret-shaped
   MCP note is never searchable/renderable.
8. The push block omits factual gotchas and drops the "with provenance" header; manual `ctx push`
   respects the same gate (DR-32).
9. Scoped override expiry: a semantic local override loses precedence on its trigger and surfaces as
   stale-flagged-retained (DR-12).
10. Pre-V1 serving containment holds: no distribution, no auto-install, no decision-trust framing;
    responses carry the accelerator-not-validated disclosure; only the O-14/dogfooding carve-out runs
    it (DR-01).
11. For unresolved symbol mentions, the pre-V1 path suppresses or flags the affected relation,
    renders a named blind spot, and freezes its design and fixtures; durable persistence and
    cross-source re-resolution remain V1-gated (DR-27).

**§8-staging rule (verbatim — governs the table above):** reproduced in the document header;
completing the R-slice is an integrity precondition, never an authorization — expansion beyond the
carve-out follows V1→minimal-V2-semantics; V2→pre-registered V3 shadow; distribution unauthorized
pre-V3.

---

## 9. Refit work-item list (the actionable backlog)

One line per DRIFT-FIX finding: **DR-id — what — where — owning slice.**

- **DR-01** — pre-V1 serving containment + accelerator-not-validated disclosure — `mcp.ts:40`,
  `cli.ts:308-337` — R-slice.
- **DR-02** — split `authority` → `derivation`+`confidence` everywhere — `001-init.sql:31`,
  `store/types.ts:21`, `remember.ts`, committed grammar — R-slice.
- **DR-03** — computed per-claim `status` view + memory-status projection — select/serve — R-slice.
- **DR-04** — freshness wiring: exclude stale in traversal/rank, honest header, per-source decay —
  `store.ts:1008-1015`, `subgraph.ts:64-96`, `render.ts:54-65` — R-slice (serve-blocking).
- **DR-05** — restricted status + disclosure class; exclude restricted from FTS/render/MCP —
  `remember.ts:365-486`, `visibility.ts:56-64` — R-slice (serve-blocking).
- **DR-06** — bind generation to D32 tuple; reject/rebuild on mismatch — `shard.ts:4-12`,
  `store.ts:855-890`, `code/adapter.ts:168-181` — R-slice (serve-blocking).
- **DR-07/DR-31** — define + serialize the minimum claim envelope under caller scope; gate factual
  serving — `render.ts:84-92`, `serve/types.ts`, `mcp.ts:174-187` — R-slice (serve-blocking).
- **DR-10** — equivalent as-of recompute path (P37 ⑧); wiring `valid_from`/`valid_to` not
  required, a bare cut escalates — migration 003 — R-slice.
- **DR-12** — scoped semantic-override expiry/re-verification — `ops.ts`, `rank.ts:43-68` — R-slice.
- **DR-16** (per P37: `frozen` until the O-25 re-scope lands, then re-issued — not `superseded`) — M3-GOAL-PROMPT/M3-ACCEPTANCE —
  on the O-25 re-scope (RECAST/FROZEN pending O-25, not retirement).
- **DR-18** — never emit heuristic build-success verdict (wire exit code) + receipt on asserting
  summaries — `src/handlers/system/summary.ts:109-133`, `base.ts:221-230` — shipping refit (+ OPEN
  defect, Appendix B).
- **DR-19** — rename/comment history fingerprint; make history claim-shaped — `src/core/
  history.ts:18-45`, `dataDir.ts:115` — first FP-L slice.
- **DR-23** — re-scope M4 snapshots to TTL+receipted accelerators; propagate identity/disclosure —
  M4 — RE-SCOPE, breadth gated V1/V2.
- **DR-24** — insert V0→V1→V2→V3 + FP-L/FP-O ladder into the route — this §8 — done here; V0 = O-22.
- **DR-25** — E0 retrieval benchmark → fix O-32/O-33 → E0 re-pass → E1/E2 grid; the v1 grids
  are evidence only — no v1 verdict is ever committed; each stage commits only data that passed
  its own gate [P38] — `tools/measurement/` — O-14.
- **DR-26** — bundle the M2 dist worker (runs from `.ts` source today); F1 overload re-key
  retire-link rides along — `codeParser.ts:148-151`, O-12 — before any install-base rollout.
- **DR-27** — pre-V1 disclosure half: named blind spot + freeze fixtures; gated half: durable
  unresolved-mention + re-resolution seam — `docs.ts:417-463`, O-16 — split (disclosure now / seam
  V1).
- **DR-30** — CLI `supersede` verb; split `needs-review` (drift-stale vs pending-unknown);
  `human-note` origin unwired — memory CLI/store — docs/OPEN (Appendix B).
- **DR-32** — omit push-block factual gotchas, reword "with provenance", gate manual push —
  `push/block.ts:35-112`, `cli.ts:273` — R-slice (use-blocking).

ORPHAN/cut items (not refits, recorded for closure): DR-09 (cut `served_count`/`last_served`),
DR-21 (`ctx debug`/`support` maintained-utility tag), DR-28 (M5 guide-perf moot), DR-29(b) (`tk`
alias prohibited by ADR 0015).

---

## 10. Testing / perf discipline + rollback (method template, P29)

Carried from the old §10/§11 where still valid; the per-slice workflow discipline
(green-before-next; priorities correctness > completeness > verifiability > token) is the M-plan
method template per `docs/codemap/RUNBOOK.md` (P29 — referenced, not restated).

**As merged — test posture** `[code: packages/core/tests/; packages/cli/tests/]`. Fixture repos generated into temp dirs
(Windows: rm with retries — EBUSY); spawn tests carry explicit timeouts (CI cold-start tax). Golden
transcripts back every serve surface (format changes = reviewed diffs). Property tests: budget never
exceeded; envelope omission counts reconcile against the typed struct (never the rendered string);
append-only claims/events never mutated on normal write paths — the DB triggers enforce it for
`memory_events`, but the rebuildable memory projection may be deleted and rebuilt wholesale by
`resetMemoryCache()` (§2's recorded exception). Living-repo
tests assert drillable/resolvable, never rendered ranking (the repo is its own acceptance fixture —
doc churn shifts rankings).

**As merged — perf gates.** `dirtyCheck` <20ms warm; `context()` <150ms warm on the fixture repo;
store size a small % of repo (index-not-copy). A11 task/NL-serve + size gates are recorded-not-
enforced (O-02, → M5).

**Rollback (still valid).** Everything additive and local: bad store → `rm -r ~/.contexa/projects/
<shard>` + `ctx sync` (sources authoritative — index-not-copy loses nothing). Push blocks are
sentinel-wrapped → removable by doctor. Importer snapshots are dated dirs — delete = revert. No
migration rewrites a source file outside managed blocks.

**Refit note:** the R-slice adds acceptance tests (§8 R-slice criteria) as the new gate; the
serve-blocking DRs (04/05/06/07/31) and the use-blocking DR-32 each land with a red→green test
before any factual machine serving is enabled.

---

## Appendix A — Drift Register (verbatim, revision 3, NORMATIVE)

> This appendix **IS the sole landed copy** of the Drift Register (revision 3, NORMATIVE) — the
> scratchpad `DRIFT-REGISTER.md` original was never committed. It carries the normativity/staging
> header, the Register table, the M-plan v2 skeleton, both Gate-A arbitration records, AND — because
> the docs landed by maintainer instruction before the batch was answered — the maintainer batch,
> now **answered/closed** (O-31 closed; all nine ruled in P37). The original batch questions are
> reproduced below for audit history.

### Maintainer batch — ANSWERED 2026-07-10 (P37; O-31 closed)

> All 9 items ruled same day (FABLE-DECISION-LOG **P37** is authoritative; summary: ① M3 recast
> not retired — on-demand local render surface, LAW §11 amendment; ② MCP carve-out confirmed;
> ③ R-slice after Gate-B review; ④ M4 last-or-batched, locally-verifiable first; ⑤ acknowledged;
> ⑥ truth panel = maintainer+Claude+Codex; ⑦ serial + measurement REDESIGN before finishing;
> ⑧ valid_from/to equivalent-scheme, served_count cut; ⑨ summarizeBuild fix early). A same-day
> follow-up (P38) ratified measurement design v2. The original questions are kept below for the
> audit trail. **Override notice (LAW/P37/P38 win over the register below, all rows kept as audit
> history):** P37 overrides DR-14/15/16 AND DR-28's retirement-dependent rationale in the Register
> table, AND the M-plan v2 skeleton's `M3 guide + projection kernel → RETIRE` row — operative state
> is **M3 RECAST/FROZEN pending O-25** (retirement rejected). P38 overrides DR-25 and the skeleton's
> `O-14 R1 self-measurement → finish + commit verdict` row — operative state is **measurement
> REDESIGNED per `docs/design/measurement/MEASUREMENT-DESIGN-V2.md` (E0-first ladder; v1 grids =
> evidence only, no verdict; protocol scripts absorbed/committed).**
>
> **P37/O-25 override — DR-07:** the register's DR-07 closing sentence ("this DTO is defined by
> THIS consumer's refit (see DR-15 — no M3-kernel revival)") is superseded — the minimum claim
> envelope is the binding base for every consumer, and under O-25 retained or reworked M3
> projection DTOs are unified with it (historical structs reused only where the re-scope justifies
> them); live prose §5 carries the operative reading.
>
> **P37 override — DR-10 (historical row):** the register's DR-10 "wire … or provide an equivalent
> bitemporal recompute path" reading is superseded by P37 ⑧ EQUIVALENT-SCHEME — wiring
> `valid_from`/`valid_to` is NOT required; an equivalent as-of recompute path satisfies §3, and a
> bare cut still escalates.
>
> **Corrigendum — DR-06 tuple wording per ADR 0040:** the D32 tuple is (repository revision,
> worktree digest, schema version, analysis-policy version) per ADR 0040:18-25; `source cursor` is
> an extra per-source freshness input, never a substitute for the repository revision. The DR-06
> historical row in the Register is kept verbatim (revision 3); this corrigendum carries the correction.
>
> **Corrigendum — DR-29 as-built anchors per P37:** `--raw` → `stdio:inherit` is at
> src/cli.ts:314-318 + src/executor.ts:637-640 (not the row's src/cli.ts:294); the old absorption
> plan now lives at docs/archive/CONTEXA-IMPL-20260703.md:513-525 (the row's pre-archive
> CONTEXA-IMPL.md:511-523 pointer is superseded). The historical DR-29 row in the Register is kept verbatim (revision 3).
>
> **Corrigendum — DR-09 anchor:** the dead `served_count`/`last_served` columns are at
> 001-init.sql:62-63 (the historical row's 001-init.sql:67-68 is superseded).
>
> **Corrigendum — DR-32 header anchor:** the push-block header claims are at
> packages/core/src/push/block.ts:35-39 (the historical row's block.ts:32-35 is superseded).

1. DR-14: confirm RETIREMENT of the M3 guide work order (P26 route change; docs kept as frozen history).
2. DR-01 + carve-out: confirm that O-14 measurement runs + maintainer dogfooding are the ONLY sanctioned uses of the greenfield MCP pre-V1 (no distribution, no auto-install, no trust framing; §8 staging governs expansion — V3 is the first live-host stage).
3. DR-02/03/06 retrofit timing: dedicated R-slice before further wedge work, or after this register settles?
4. DR-23/M4 sequencing (narrowed per Gate A r2): WoZ-only until V1; after V1, build only the minimal receipted adapters V2 needs. Confirm.
5. §9 boundary acknowledgement: maintained filtering/recovery utility continues regardless; local-facet EXPANSION stops if FP-L fails (LAW already answers; listed for acknowledgement).
6. Who staffs V1's independent truth panel?
7. Commit the R1 verdict first, or start V0 in parallel?
8. DR-09/DR-10: cut served_count columns; valid_from/valid_to = wire-or-equivalent inside R-slice (bare cut would need LAW escalation).
9. DR-18: schedule the summarizeBuild exit-code fix + summary-receipt refit (shipping code defect; report-only in this audit).

### Normativity / staging header

Checkpoint of Phase 3.1 (design-reconciliation run, 2026-07-10). Synthesized by Fable from analysts
A1–A6; Phase-1 evidence C1–C6. **Revision 2 — post-Gate-A round 1**: Codex (gpt-5.6-sol ultra)
returned 16 findings (8 BLOCKER / 8 MAJOR), verdict FAIL; Fable arbitrated ALL 16 as accepted (two
with scoping adjustments). **Revision 3 — post-Gate-A round 2** (7 residual issues arbitrated).

NORMATIVITY: A1–A6 and C1–C6 are PRE-ARBITRATION evidence only. Where they conflict with this table
(e.g. A6 still allows M3 re-entry / full O-16 pre-gate; A4 predates the DR-20 correction), THIS
TABLE alone is normative.

Classes: CONFORMS / DRIFT-FIX / DRIFT-ESCALATE / GATED / ORPHAN. "serve-blocking" = must land before
the greenfield MCP serves factual claims into ANY host session. Sole carve-out: the already-ratified
O-14/P32 measurement runs and the maintainer's own dogfooding — sanctioned development use, isolated,
record-only; this carve-out reading is itself escalated to the maintainer batch (Q2), not silently
assumed. Distribution staging per LAW §8: pre-V1 = no distribution, no auto-install, no
decision-trust framing; V1 pass unlocks only building the minimal semantics V2 needs; V2 pass unlocks
only the pre-registered non-blocking V3 shadow; general distribution is not authorized by the current
LAW at any pre-V3 stage.

### Register

| id | subsystem | class | contract anchor | evidence | disposition proposal |
|---|---|---|---|---|---|
| DR-01 | store+mcp | GATED (distribution) | R2; §8.1; art. 8 shadow-entry | mcp.ts:37-93 ("Start any task here", unqualified); cli.ts:308-337 (install auto-registers MCP + push block) | The persisted M1/M2 graph is served by the greenfield MCP as ordinary tool results with NO accelerator/unvalidated qualification. KEEP the rebuildable substrate; pre-V1 containment = no distribution, no auto-install, no decision-trust framing, responses carry an accelerator-not-validated disclosure; only the O-14/dogfooding carve-out (header, maintainer-confirmed) runs it at all. Expansion follows the §8 staging in the header — V3 is the first live-host stage. |
| DR-02 | store+memory | DRIFT-FIX | §3 derivation+confidence; §7.1 | 001-init.sql:31; types.ts:21; remember.ts:54,365-399; committed mem/dec grammar | Split EVERY persisted/carried `authority` field (claims, memory rows, memory_events, committed mem/dec line grammar, TS types) into `derivation(OBSERVED\|DECLARED\|INFERRED)` + `confidence(CONFIRMED\|LIKELY\|POSSIBLE)`. Backfill from carrier+method+create-event actor, never from the legacy enum or authorship alone. CONFIRMED requires independent corroboration; LIKELY only where the source is authoritative for that claim type (§7.1 matrix logic); ambiguous legacy rows stay `unknown` and never render as likely facts. Note: production writes `origin=remember`, not `human-note` — no mechanical human-authored backfill exists. ⚖ direction FIX (LAW explicit); retrofit timing → maintainer batch. |
| DR-03 | store | DRIFT-FIX | §3 status enum | A1-3/A3-3; scattered links.stale/conflicts/memory.status | Derive per-claim `status` (resolved/conflicting/stale/unavailable/restricted/unknown) as a computed view; document the memory-status projection (active→resolved, needs-review(drift)→stale, needs-review(pending)→unknown, unresolvedHere→unavailable; restricted reserved until DR-05 exists). |
| DR-04 | store/serve | DRIFT-FIX (serve-blocking) | §3 freshness; art. 1 per-claim freshness; R2 | store.ts:1008-1015 (drift → links.stale only); subgraph.ts:64-96 (traversal ignores stale); render.ts:54-65 (header `fresh` from adapter-pending only); no read-through in search | Hash-drift detection exists but is NOT a freshness guarantee: it fires after selection, selection ignores `links.stale`, search does no read-through, and detected drift is never rendered. Refit: exclude/downgrade stale links in traversal+ranking, render claim freshness as unknown-until-reverified, rename header state honestly (index-catchup), add per-source decay class + re-verification trigger for non-file connectors. |
| DR-05 | store+memory+serve | DRIFT-FIX (serve-blocking) | §3 restricted/disclosure; §4 "explicit and classified" | remember.ts:365-385 (secret guard scans mainline path only; MCP notes land overlay unscanned); remember.ts:415-486 (raw gist/detail → store+FTS); visibility.ts:56-64 (overlay/needs-review served by default) | No-egress + overlay placement are NOT restricted-evidence enforcement: secret-shaped/restricted content stays indexed, searchable, renderable via MCP (host agent may forward it anywhere). Refit: real `restricted` status + `disclosure` class field (default local), exclude restricted bodies (and relationship-derived leaks) from FTS/render/machine interfaces, emit only a cited withheld/unavailable outcome. |
| DR-06 | store | DRIFT-FIX (serve-blocking) | §3 immutable-state keying; D32/ADR0040 | shard.ts:4-12 (all worktrees share one shard); 001-init.sql:79-81 + store.ts:855-890 (gen = per-source int); code adapter.ts:168-181 (same size+mtime → clean, no hash) | `published_gen` is only a visibility pointer: worktree digest, schema version, and analysis-policy version participate in NEITHER dirty-check NOR generation identity while all worktrees share one shard — a clean dirty-check can reuse rows built under another worktree/policy and serve them `fresh`. Refit: bind every published generation to the D32 tuple; reject/rebuild on any component mismatch. |
| DR-07 | serve | DRIFT-FIX (serve-blocking) | art. 2/3 at render; R6 | render.ts:84-92; select/types.ts:25-40 (RenderedItem has no claim id/status/freshness/disclosure/evidence) | Envelope cites locators but no per-claim trust data reaches the consumer; a `[handle]` is navigation, not a source anchor. Refit: define the minimum claim envelope (evidence anchor incl. revision/hash, observed time, derivation, confidence, status, freshness, disclosure) rendered tersely; this DTO is defined by THIS consumer's refit (see DR-15 — no M3-kernel revival). |
| DR-08 | store/serve | CONFORMS | art. 1/2/4; R3/R5; §4 | A1-8..13; A3-2 | Contentless FTS (index-not-copy); claims/links separation; conflicts side-by-side never squeezed; shrink-guard success-shaped refusal; RECONCILING serves previous gen (fail-open); assertNoEgress + zero network calls (measured). Conformance base for the new DESIGN. |
| DR-09 | store | ORPHAN | none (research ruled OUT) | 001-init.sql:67-68; O-07 | `served_count`/`last_served` dead columns — cut; closes O-07 as "cut" if ratified. |
| DR-10 | store | ORPHAN/GATED | §3 bitemporal | migration 003; no reader in select/serve | `valid_from`/`valid_to` written, never read. Wire during the DR-03/DR-06 refit, or provide an equivalent bitemporal recompute path; a bare cut would drop §3's bitemporal promise and therefore requires LAW-side escalation, not a local decision. |
| DR-11 | memory | CONFORMS (scoped) | §4 local facet; art. 1 capture | fileStore.ts:29-47; remember.ts:39-97; push/rank.ts:56-59 | Zones, surface routing, gitignored overlay, remember-local push-exclusion, mainline secret-guard path = local-facet mechanics conform. ⚖ Scoped by Gate A: this CONFORMS does NOT extend to disclosure enforcement (→DR-05) or the push block's citation posture (→DR-32). |
| DR-12 | memory | DRIFT-FIX (was ESCALATE) | §3 "local overrides expire" | ops.ts:6,24; rank.ts:43-68 (90d soft decay only, override never loses eligibility) | ⚖ Downgraded per Gate A: expiry = loss of current precedence/eligibility, NOT deletion — no contradiction with append-only/non-destruction. Scope to semantic local overrides (e.g. `remember --local --supersedes`): add an expiry/re-verification trigger; expired overrides surface as stale (flagged, retained). Trigger/cadence = implementation choice. |
| DR-13 | memory | GATED (built) | §8 ladder | push.ts/dedup.ts/catchup.ts | Cross-checkout collaboration layer built pre-pilot. Keep as-built; reliability maintenance only; NO further broad expansion until FP-L shows behavior change. |
| DR-14 | m3 | DRIFT-FIX (retire plan) | art. 1 (settled); §10 LAW-wins | M3-GOAL-PROMPT.md:8; CONTEXA-IMPL.md:595; PRODUCT-DESIGN.md:53-58; §9 survivor clause = Atlas-failure fallback (PRODUCT-DESIGN.md:297-299), not an M3 unlock | ⚖ Corrected per Gate A: the six-page browsable guide is prohibited as a destination under settled art. 1 — no §8 pass revives it; §9's admin/inspection clause is a failure fallback for Atlas, not an M3 re-entry path. Propose RETIRE the M3 work order (zero code exists); docs kept as frozen history (bookkeeping). Any future admin/inspection tool = separate scope + separate authority. Maintainer confirms the retirement (P26 procedural authority). |
| DR-15 | m3 | ORPHAN/RETIRED (frozen history; no re-entry) | art. 2; ADR 0020 | M3-GOAL-PROMPT.md:40-46; M3-ACCEPTANCE.md:17-20 | Retire the named five-struct kernel with the guide (⚖ reclassed from GATED per Gate A r2 — GATED implied a future unlock, contradicting retirement). The five structs are page-coupled, not a proven generic seam. If a decision-moment consumer needs a shared claim DTO (DR-07/DR-31), that minimum envelope is defined fresh in that consumer's refit; it does not inherit the M3 structs. |
| DR-16 | m3 | DRIFT-FIX | durable-context (plans carry status) | C4 §1 (0 frontmatter matches) | M3-GOAL-PROMPT.md + M3-ACCEPTANCE.md get `status: superseded` (on ratified retirement) + supersede pointer to the new registers. |
| DR-17 | m3 | split: CONFORMS + DRIFT-FIX (spec) | art. 2/3; R5; §3 | M3-ACCEPTANCE.md:16-23 | G-readonly / G-loopback / G-profile-budget conform and are preserved as spec content. ⚖ G-provenance does NOT: it carries the pre-LAW `carrier/locus/method/authority/at` vocabulary — any future surface spec must use the full §3 claim contract (revision/hash anchor, observed time, derivation, status, confidence, freshness, disclosure). |
| DR-18 | shipping | split: CONFORMS + DRIFT-FIX | R3; art. 3 | conforms: A4-2/3/6/7/8/10. Hazard: summary.ts:105-133 (summarizeBuild takes no exit code; errors==0&&warnings==0 → "[ok] Build successful"); coexistence path summary.ts:214-225 (⚖ line corrected per Gate A r2; :268 is the over-budget replacement, no [ok] body); in-budget summaries carry no raw receipt (base.ts:221-230 pointer only on declared-omission) | ⚖ Split per Gate A: fail-open gate, recovery, telemetry, ledger separation CONFORM as wedge mechanics. Synthesized summaries do NOT conform as evidence: keyword-derived success verdicts can contradict the real exit code, and normal summaries lack an immutable receipt/anchor. Plan refit: (a) never emit a heuristic success verdict (wire exit code through; neutral counts otherwise); (b) every synthesized summary that asserts facts carries a raw receipt/anchor (extend the existing snapshot pointer beyond declared-omission) or stops asserting — this is the shipping edge of DR-19's claim-shaping. Code defect filed as OPEN candidate (report-only in this audit). |
| DR-19 | shipping | DRIFT-FIX (plan) | §4 "still valid?"; §5.4; §3 keying | history.ts:18-45; dataDir.ts:115 | History records are proto-claims, not claim-shaped: `project_fingerprint` = path hash (accounting id), no commit/worktree binding, no VALID/STALE recompute. Confirmed by Gate A. Strictly the first FP-L slice — NOT a general retrofit. Rename/comment the fingerprint field. |
| DR-20 | shipping+cli | DRIFT-FIX (scoped) + GATED | R4; R6 | hostAdapter.ts:88-197 (root: hook/shim/injection only); cli.ts:308-337 + mcpConfig.ts:41-85 (greenfield `ctx mcp` EXISTS, unreleased: package version 0.0.0) | ⚖ Corrected per Gate A: MCP is implemented in the greenfield tree; the gap is DISTRIBUTION + R6 semantic compliance (DR-31), not absence. That server does not proxy shell execution, so it does NOT remove the filter's per-command spawn tax; any host-held command-observation pipe is separate GATED scope, not a refit. |
| DR-21 | shipping | ORPHAN (maintained utility) | §9 fallback | A4-9 | `ctx debug`/`support`: keep as no-egress field plumbing; tag "maintained utility, no scope growth"; death condition = superseded by facet tooling. |
| DR-22 | artifacts | GATED (map) | §5; §8.1; §9 | A5 table | Artifact statuses: 1 partial local proto-Brief (keep claim-backed = pre-gate-legal); 2 substrate only (gated, make-or-break); 3 substrate only (gated, org pilot); 4 partial strongest — two unjoined halves (shipping proto-card + greenfield VALID/STALE primitives), build-out pre-gate-legal under FP-L; 5 zero (expected). **[Override — LAW §8:** the LAW wins over this register. Artifact 1 has **no pre-gate build-out authorization**: keep the existing claim-backed proto-Brief only; a V1 pass unlocks only the minimum semantics pre-registered as necessary for V2, and any broader Context Brief construction requires an explicit ladder gate. "pre-gate-legal" here is superseded for Artifact 1.**]** |
| DR-23 | route | GATED + DRIFT-FIX (was ESCALATE) | R2 ("on-demand compilation OVER AN INGESTED SUBSTRATE"; accelerators with TTL+receipts allowed); §8.3 | PRODUCT-DESIGN.md:176-180; A6-2 | ⚖ Corrected per Gate A: M4's dated snapshots do not inherently contradict R2. Re-scope: snapshots retained only as TTL- and source-receipted accelerators, revalidated before trigger-time bitemporal compilation; caller identity/disclosure propagation enforced; connector absence = named blind spot. Gate connector BREADTH on V1/V2; live-reads-only is not required by R2. |
| DR-24 | route | DRIFT-FIX | §8 ladder absent from route | A6-3/4; O-22 | Insert V0 (freeze O-22 WoZ protocol — immediate next step) → V1 WoZ → V2 backtest → V3 live shadow + FP-L (early, §9 survivor) / FP-O (gated). |
| DR-25 | route | CONFORMS-incomplete | art. 8; O-14 | C6 (.work grids: sonnet HOLD / codex 100% void / protocol pilot; all uncommitted) | R1 self-measurement sanctioned + partially executed, results uncommitted. Finish → commit a real verdict; measured numbers only. **[Override — P38:** this row is superseded. Measurement is REDESIGNED per `docs/design/measurement/MEASUREMENT-DESIGN-V2.md` (E0-first ladder); v1 grids = evidence only, no verdict; the protocol scripts are now absorbed/committed (the "codex 100% void" report was STALE — post-rerun 48 pass/13 fail/5 void). Commit measured numbers only for a stage that passes its own bar.**]** |
| DR-26 | route | DRIFT-FIX (reliability) | R4 distribution-first | O-12 | F2: M2 worker runs from source, not bundled — must land before any install-base rollout. F1 overload re-key retire-link rides along. |
| DR-27 | route | split: DRIFT-FIX (disclosure) + GATED (construction) | art. 4 named blind spots; §8 | docs.ts:417-452; OPEN.md:21 ("needs ratification, not a bolt-on") | ⚖ Split per Gate A: the full fix (durable unresolved-mention persistence + cross-source re-resolution seam) is NEW substrate construction — gated behind V1. Pre-V1 the honest half proceeds: suppress/flag the affected relation and render a named blind spot; freeze the design + fixtures now. |
| DR-28 | route | ORPHAN (moot) | — | A6-11 | M5 guide-perf items moot with M3 retired; M5 re-scoped to measurement + local wedge perf gates. |
| DR-29 | route | split: AS-BUILT + GATED (remaining absorption) | §4 today's assets; §8 | ⚖ state corrected per Gate A r2: hard rename + `ctx` bin ALREADY LANDED (package.json:2 name=contexa, bin ctx; ADR 0015 explicitly bans a `tk` alias); `--raw` stdio:inherit ALREADY LANDED (src/cli.ts:294). Old absorption plan: CONTEXA-IMPL.md:511-523 | Split three ways: (a) as-built rename + raw stream fidelity = done, record as current state, not future work; (b) `tk` alias = ORPHAN, prohibited by ADR 0015; (c) still-unbuilt absorption (JSONL→SQLite ledger migration, recall handles, session-provenance plumbing) = product/storage expansion GATED on FP-L. Off-critical-path ≠ pre-gate-authorized. |
| DR-30 | memory | DRIFT-FIX (docs) | — | A3 adjacent 1–4 | OPEN candidates: CLI lacks `supersede` verb; `needs-review` overloads drift-stale vs confirmation-pending (§3 splits stale vs unknown); `human-note` origin unwired. |
| DR-31 | mcp | DRIFT-FIX (serve-blocking) NEW | R6 same claims/citations/UNKNOWNs under caller identity; art. 2/3 | mcp.ts:174-187 (text-only transport); serve/types.ts:1-5 (diag not serialized); ServeDeps has no caller scope | The MCP is a Markdown transport, not the same-claim machine interface R6 requires: caller scope and per-claim evidence/observed-time/derivation/status/confidence/freshness/disclosure and cited UNKNOWN/restricted outcomes never reach the host. Gate factual machine serving until the minimum claim envelope (DR-07) is serialized. |
| DR-32 | memory/push | DRIFT-FIX NEW (use-blocking) | art. 3 citation-or-silence; §3 full claim contract | block.ts:32-35 (header claims "with provenance" + "Start tasks with the `context` MCP tool"); block.ts:35-65 (gotchas render as `⚠ gist [handle]`, no anchor/status/freshness); block.ts:85-112 (1KB truncation undisclosed in placed block); cli.ts:273 (manual `ctx push` writes host files independent of install gating) | ⚖ Strengthened per Gate A r2: the always-loaded push block renders uncited memory claims into host instruction files, and manual `ctx push` bypasses any install-side gate. Pre-gate: OMIT factual gotchas entirely and drop/reword the "with provenance" header to non-claiming text (tool instructions may stay). If factual gotchas ever return, each carries the FULL minimum claim envelope (revision/hash anchor, observed time, derivation, confidence, status, freshness, disclosure) + explicit omission disclosure. |

### M-plan v2 skeleton (post-Gate-A)

| v2 element | disposition | gate / justification |
|---|---|---|
| M1 local-facet wedge (done) | KEEP + RETROFIT | may-proceed: reliability/wedge correctness |
| M2 code substrate (done) | KEEP + RETROFIT | may-proceed: substrate correctness; no decision-trust claims pre-V1 |
| **R-slice "claim-serving integrity"** (NEW, groups DR-01/02/03/04/05/06/07/10/12/27-disclosure/31/32) | RETROFIT on merged code only — precondition for ANY factual claim serving (see header carve-out); adds NO new breadth | may-proceed (wedge correctness on merged code); completing it does NOT itself authorize distribution — §8 staging in the header governs expansion |
| V0 O-22 protocol freeze | NEW — immediate next step | §8.1 stage-1 precondition; zero code |
| V1 WoZ shadow (stage 1) | NEW | gated on V0; kill bar <9/12 or any material false reassurance |
| FP-L ctx continuity pilot | NEW — may proceed early | §9 survivor; first slice = DR-19 claim-shaping |
| M3 guide + projection kernel | RETIRE work order (maintainer confirms); docs → frozen history | art. 1 settled; no re-entry clause; future admin tool = separate scope+authority |
| M4 → org connectors | RE-SCOPE per DR-23 | snapshots as TTL+receipted accelerators; breadth gated on V1/V2 |
| V2 backtest (stage 2) | NEW | gated on V1; produces §7.2 thresholds |
| FP-O Atlas concierge pilot | NEW | gated: needs V1 + connectors |
| V3 live shadow (stage 3) | NEW | gated on V2 |
| M5 → measurement + wedge perf | RE-SCOPE | DR-25/DR-28 |
| O-14 R1 self-measurement | KEEP — finish + commit verdict | sanctioned; DR-25 |
| Compressor absorption | SPLIT per DR-29 | fidelity fixes proceed; rebrand/migration gated on FP-L |

### Gate-A arbitration record (round 2)

Codex r2 returned 7 residual issues (3 BLOCKER / 4 MAJOR), verdict FAIL; both r1 Fable adjustments
were upheld. Fable arbitration: #1 (A1–A6 normativity) ACCEPTED → normativity banner added. #2
(staging/serving gate) ACCEPTED WITH ESCALATION — Codex's no-local-exception reading would also
forbid the ratified O-14 measurement (arm B = ctx MCP); resolved as an explicit O-14/dogfooding
carve-out escalated to maintainer batch Q2, plus full §8 staging in the header, R-slice
de-authorized as an expansion trigger, DR-12/DR-27-disclosure added to the R-slice, DR-10 bare-cut
barred. #3 (DR-32) ACCEPTED → use-blocking, omit-facts-pre-gate, full envelope if facts return,
manual-push path recorded. #4 (batch Q4/Q5) ACCEPTED → Q4 narrowed, Q5 dissolved to acknowledgement.
#5 (DR-18) ACCEPTED → line corrected :214-225, receipt requirement added. #6 (DR-15) ACCEPTED →
reclassed ORPHAN/RETIRED. #7 (DR-29) ACCEPTED → as-built rename/raw-fidelity recorded, `tk` alias
ORPHAN per ADR 0015, remaining absorption gated.

### Gate-A arbitration record (round 1)

Codex findings 1–16: ALL ACCEPTED. Materially changed: DR-01/04/05/06/07 severity+content, DR-14 (§9
misread corrected; freeze→retire), DR-12 (ESCALATE→FIX; expiry=eligibility-loss), DR-15 (re-entry
clause removed), DR-17/18/27/29 (split), DR-20/23 (stale claim / R2 misread corrected), DR-02
(mapping rules), +DR-31/DR-32 added. Fable adjustments: (a) DR-14 retirement still routes through the
maintainer batch — procedural authority over a P26-ratified route, not a product gate; (b) DR-18:
[FAIL] envelope header partially mitigates (verified), severity kept as defect + refit. Fable
verified in source before accepting the A4-contradicting finding: summary.ts:105-133,268.

> The register's **Mandatory questions** (A1–A6 pre-arbitration digests) and **Maintainer batch
> questions** (Phase 5, 9 items incl. DR-14 retirement confirmation, the O-14 carve-out reading,
> R-slice timing, M4 sequencing, truth-panel staffing, R1-verdict-vs-V0 ordering, DR-09/DR-10 cut
> decisions, and the summarizeBuild defect schedule) are delivered to the maintainer separately and
> are not reproduced in this appendix.

---

## Appendix B — OPEN.md candidates produced by this audit (new items only)

To be appended to `OPEN.md` on ratification (report-only here; this audit does not modify source):

- **summarizeBuild exit-code defect** (DR-18) — `src/handlers/system/summary.ts:126` emits
  "[ok] Build successful" from keyword counts with no exit code; a non-zero build can render
  successful. Shipping code defect — schedule the exit-code wire-through + summary-receipt refit.
- **M3 docs frontmatter** (DR-16) — `docs/build/M3-GOAL-PROMPT.md` + `M3-ACCEPTANCE.md` carry no
  `status:`/`review_after:`; on the O-25 re-scope set `status: frozen` (RECAST/FROZEN pending O-25,
  not retirement/superseded per P37) + supersede pointer.
- **CLI `supersede` verb** (DR-30) — `supersede` exists in the memory event enum but is not in the
  CLI `LIFECYCLE_VERBS` map `[code: cli.ts:118-122]`; not directly invocable.
- **`needs-review` overload** (DR-30) — the status conflates drift-stale vs confirmation-pending;
  LAW §3 splits `stale` vs `unknown`. Split at the DR-03 status view.
- **`human-note` origin unwired** (DR-02/DR-30) — `MemoryOrigin` includes `human-note` but production
  only writes `remember`/`remember-local`/`host-import:*`; no path produces `human-note`.
- **Adapter cost/order note** (DR-26 adjacent) — docs.ts declares `cost=6` and runs after code on
  cold sync so symbols exist for mention resolution; the registry order (git→docs→memory→code) vs the
  cost order is worth a one-line comment to prevent a future reorder from breaking mention resolution.
- **M2 dist worker not bundled** (DR-26/O-12) — the parse worker runs from `.ts` source via
  `--experimental-strip-types`; bundle before any install-base rollout. F1 overload re-key
  retire-link rides along (O-12 already open; cross-reference).
- **R1 grid run uncommitted** (DR-25) — a full local grid run exists only in gitignored `.work/`
  (HOLD/INSUFFICIENT_DATA), exceeding the "maintainer supervises spend" boundary with no committed
  report. **[Override — P38:** superseded. Measurement is REDESIGNED per
  `docs/design/measurement/MEASUREMENT-DESIGN-V2.md` (E0-first ladder; v1 grids = evidence only, no
  verdict); the protocol scripts are now absorbed/committed. Do not simply commit the v1 verdict —
  run E0 first, fix O-32/O-33, then E1/E2.**]**

---

## Appendix C — Old-register claim dispositions (Part B, claims 66–130)

Accounting for the old `CONTEXA-IMPL.md` claims (C5 Part B). **CARRIED** = still-valid, prose reused
above; **SUPERSEDED** = replaced by LAW/M-plan-v2, pointer given; **DROPPED** = removed with reason.
Grouped by section; per-claim ids listed.

- **66–68 (header / route principle).** 66 (deliberately-not-input provenance) CARRIED as history.
  67 (Node ≥22.5 / node:sqlite / pnpm) CARRIED — actual `engines >=22.18.0` (C1). 68 (route = optimal
  path from product definition) **SUPERSEDED** by LAW §8 gate-first staging + M-plan v2 (§8); the
  "consumer's seat" framing survives, but the ladder now decides sequencing, not "optimal path".
- **69–71 (repo layout).** 69 (greenfield, no compressor imports) CARRIED (§1). 70 (packages/
  core+cli+**guide**) CARRIED for core+cli; **the `guide` package is RECAST/FROZEN pending O-25**
  (M3 recast under P37/LAW §11 — retirement rejected; zero code, C4). 71 (core never spawns / MCP shim in cli) CARRIED (§1, §5).
- **72–79 (store DDL).** All CARRIED as the as-merged store (§2) — 72 shard/WAL, 73 full DDL, 74
  unresolved-here disjoint from stale-suspect, 75 connection bootstrap PRAGMAs, 76 index-not-copy
  total, 77 contentless-FTS excerpts, 78 migrations. 79 (D32 generation-identity tuple) CARRIED as
  the **target**, but **flagged: as-merged it is a bare integer** — this is exactly the DR-06 refit
  (§2.x). Detail spec referenced at `docs/codemap/impl/E-freshness-incremental.md:73` (P29).
- **80–83 (identity / locators / handles).** All CARRIED (§3 symbol id; §2 tables). 80 stable-id
  rationale, 81 id scheme, 82 locator union + read-through hardening, 83 handles — carried as
  as-merged mechanics; the handle is navigation-not-anchor point is sharpened by DR-07/DR-31 (§5).
- **84–91 (ingest framework).** All CARRIED (§3) — 84 SourceAdapter, 85 refresh time-box, 86 dirty
  detection + fingerprint, 87 cheapest-first + three-tier staleness, 88 cold-path ignore-set, 89
  lease, 90 incremental triad, 91 generation publish. Adapter now also carries a `cost` field
  (as-merged, C3).
- **92–100 (extractors).** All CARRIED (§3) — 93 git, 94 code/tree-sitter+SCIP, 95 decisions, 96
  stories (M4-reserved), 97 docs/glossary + O-16 flagged (DR-27), 98 memory event model, 99 host
  importers (Claude Code built; others follow), 100 dedup rules. 97's symbol-mention half exposes the
  DR-27 blind spot (§3).
- **101–102 (selection).** CARRIED (§5) — 101 five-stage pipeline (seeds/subgraph/PPR/sections/
  projection), 102 `search()` = stages 1–2. As-merged uses RRF+heat+authority composite (C3).
- **103–110 (serving surface).** 103 MCP three tools CARRIED (§5). 104 serving rules CARRIED, but the
  two-anchor-state + secret-guard sub-claims are sharpened by DR-05/DR-32 (§5). 105 markdown envelope
  CARRIED (§5). 106 push block CARRIED as as-merged **but its "with provenance" header + factual
  gotchas are the DR-32 use-blocking refit** (§5). 107 host placement (AGENTS.md + CLAUDE.md two-file
  floor) CARRIED. **108 Guide + 109 on-demand Inferred generation = RECAST/FROZEN pending O-25** (M3
  recast under P37/LAW §11 — retirement rejected; zero code, C4) — art. 1's prohibition targets
  standing/central browse-first destinations, not the on-demand local render surface; every rendered
  claim carries the §3 envelope. 110 CLI surface CARRIED (as-merged verbs differ:
  no `context`/`search` CLI subcommand — MCP-only; C3 §5).
- **111 (adjacent compressor track).** CARRIED but **SPLIT** by DR-29: rename + `--raw` stdio:inherit
  already landed (record as current state); `tk` alias DROPPED (prohibited by ADR 0015); remaining
  absorption (JSONL→SQLite ledger, recall handles, session-provenance) GATED on FP-L (§6, §9).
- **112–119 (build route M1–M5).** **SUPERSEDED** by M-plan v2 (§8). 112 route logic (invisible
  context first) survives as rationale. 113–114 (M1 acceptance + spec addenda) CARRIED as history —
  M1 is built. 115 (M2 scope/acceptance) CARRIED as history — M2 is built. **116 (M3) RECAST/FROZEN
  pending O-25** (retirement rejected, P37/LAW §11; DR-14 overridden). 117 (M4) **RE-SCOPED** per DR-23. 118 (M5) **RE-SCOPED** per DR-25/DR-28. 119
  (adjacent track any time after M1) CARRIED with DR-29 gating.
- **120–124 (testing / perf / rollback).** All CARRIED (§10) — 120 fixture/spawn discipline, 121
  golden transcripts, 122 perf gates (A11 recorded-not-enforced, O-02), 123 property tests, 124
  rollback. The R-slice adds serve-blocking acceptance tests on top.
- **125–130 (Absorption Register).** CARRIED by reference-not-copy (P29) — the mining verdicts (125
  stance, 126 integrated-inline list, 127 reference map, 128 validation-by-absence, 129 empirical
  validations, 130 legacy read-back map) live in the old §12 and `docs/codemap/impl/*`; this register
  preserves the **§12 read-back map and P29 reference-not-copy pointers** rather than duplicating
  detail-layer content. The legacy read-back map (130) remains the index into
  `docs/codemap/impl/{A1,A2,A3,D,E,G,J,K,L,M-*}` for D4/D16/D20/D19/D23/G/J specs.

**Net:** carried = the store/ingest/extract/select/serve/memory/wedge mechanics (the bulk);
superseded = the route (→ M-plan v2 §8); the guide/M3 is RECAST/FROZEN pending O-25 (retirement rejected, P37); dropped = `tk` alias, dead
usage columns, and (pending DR-02) the flat 4-value `authority` enum.
