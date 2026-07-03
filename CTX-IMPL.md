# ctx — Implementation Design

> **Status: implementation-step output**, derived independently from `CTX-DESIGN.md` (P15–P25)
> and first principles only. Prior implementation docs (`docs/codemap/impl/*`, `schema-draft.sql`)
> were deliberately NOT used as input (maintainer instruction 2026-07-03); where they conflict,
> this document wins unless the maintainer says otherwise. `.research/` mining results feed the
> **Absorption Register** (§12) — slots marked `⛏` await those reports.
>
> Language: TypeScript, Node ≥22 (`node:sqlite`), pnpm. All techniques adopted directly (P25④);
> ordering below is Implementation dependency only.
>
> **Route principle (maintainer, 2026-07-03)**: the build route is the OPTIMAL PATH from the
> product definition — measured from the consumer's seat. Explicitly NOT route inputs: the
> current tk codebase, the compressor, the June contract's slice DAG, and any reference
> project's trajectory. The compressor is an adjacent track (§8), never on the critical path.

---

## 1. Repo Layout

pnpm workspace, greenfield packages. Nothing on the critical path imports from, waits on, or
migrates the existing compressor tree — it keeps shipping independently until the adjacent
absorption track (§8) picks it up.

```
packages/
  core/        # THE PRODUCT: store + ingest + extract + select + serve (pure library, no I/O CLI)
    src/store/       # DDL, migrations, generations, lease, handles
    src/ingest/      # SourceAdapter framework + per-carrier adapters
    src/extract/     # per-content-type extractors (pure: raw record -> claims)
    src/select/      # seeds -> subgraph -> PPR -> sections -> projection
    src/serve/       # context()/search()/remember() as library calls + envelope + renderers
    src/push/        # digest builder + host adapters
  cli/         # `ctx` bin: init/doctor/mcp/guide/import/remember/recall/memory/push/sync
  guide/       # React + Vite web app; served by cli via loopback Hono server
```

Rules: `core` never spawns long-lived processes; `core` never imports from `cli`/`guide`;
everything user-visible goes through `cli` or a host adapter. MCP server = ~50-line shim in
`cli` over `core/serve` (the host keeps it resident per session — the only per-call-spawn-free
channel we get without a daemon).

## 2. Store — concrete DDL

One DB per project shard: `~/.ctx/projects/<shard>/store.sqlite` (WAL). Requires SQLite ≥3.43 semantics
(`contentless_delete`) — Node 22's bundled SQLite satisfies this; `ctx doctor` asserts it.

```sql
PRAGMA journal_mode=WAL;

CREATE TABLE entities (
  id            TEXT PRIMARY KEY,   -- "<kind>:<stable-key>", see §3
  kind          TEXT NOT NULL,      -- symbol|file|module|commit|pr|issue|decision|doc_section|
                                    -- story|meeting|memory|concept
  name          TEXT NOT NULL,
  locator       TEXT NOT NULL,      -- JSON Locator (§3); read-through address (index-not-copy, P25①)
  content_hash  TEXT,               -- staleness check for file-backed entities
  source_rev    TEXT,               -- git tip / snapshot date / write time
  attrs         TEXT NOT NULL DEFAULT '{}',
  first_seen    INTEGER NOT NULL,
  last_verified INTEGER NOT NULL,
  gen           INTEGER NOT NULL
);
CREATE INDEX entities_kind_name ON entities(kind, name);

-- Append-only. Every extracted fact lands here first, provenance intact.
CREATE TABLE claims (
  id        INTEGER PRIMARY KEY,
  subject   TEXT NOT NULL,          -- entity id
  predicate TEXT NOT NULL,
  object    TEXT,                   -- entity id or JSON scalar
  carrier   TEXT NOT NULL,          -- git|files|tree-sitter|scip|github|jira|confluence|remember|host:<h>
  locus     TEXT,                   -- where inside the carrier (commit oid, file#Lx, api path)
  method    TEXT NOT NULL,          -- explicit-key|path-match|symbol-match|rename-tracked|
                                    -- structural|semantic-proposal
  authority TEXT NOT NULL CHECK (authority IN ('observed','derived','inferred','confirmed')),
  at        INTEGER NOT NULL,
  gen       INTEGER NOT NULL
);
CREATE INDEX claims_subject ON claims(subject, predicate);

-- Resolved current view (claims -> arbitration -> links). Selection reads THIS, never claims.
CREATE TABLE links (
  src TEXT NOT NULL, dst TEXT NOT NULL, predicate TEXT NOT NULL,
  method TEXT NOT NULL, confidence REAL NOT NULL DEFAULT 1.0,
  claim_id INTEGER,                 -- provenance back-pointer
  verified_at INTEGER NOT NULL, stale INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (src, predicate, dst)
);
CREATE INDEX links_dst ON links(dst, predicate);

CREATE TABLE conflicts (
  a INTEGER NOT NULL, b INTEGER NOT NULL,      -- claim ids
  kind TEXT NOT NULL,                          -- contradiction|sameAsCandidate|stale-suspect
  status TEXT NOT NULL DEFAULT 'open',         -- open|resolved|dismissed
  PRIMARY KEY (a, b)
);

CREATE TABLE memory (
  entity_id    TEXT PRIMARY KEY REFERENCES entities(id),
  gist         TEXT NOT NULL,                  -- hard cap 240 chars, enforced at write
  detail       TEXT,
  origin       TEXT NOT NULL,                  -- remember|host-import:<host>|human-note
  session_ref  TEXT,
  authority    TEXT NOT NULL,                  -- inferred|confirmed
  status       TEXT NOT NULL DEFAULT 'active', -- active|needs-review|superseded|retired
  served_count INTEGER NOT NULL DEFAULT 0,
  last_served  INTEGER
);
CREATE TABLE anchors (memory_id TEXT NOT NULL, entity_id TEXT NOT NULL,
                      PRIMARY KEY (memory_id, entity_id));

-- Contentless FTS (index-not-copy): text is indexed, never stored; serve does locator read-through.
CREATE VIRTUAL TABLE fts USING fts5(
  name, text, kind UNINDEXED, entity_id UNINDEXED,
  content='', contentless_delete=1,
  tokenize = "unicode61 tokenchars '_$'"
);

CREATE TABLE handles (short TEXT PRIMARY KEY, entity_id TEXT NOT NULL, facet TEXT);

CREATE TABLE cursors     (source TEXT PRIMARY KEY, position TEXT, freshness INTEGER, gen INTEGER);
CREATE TABLE generations (source TEXT PRIMARY KEY, published_gen INTEGER NOT NULL DEFAULT 0,
                          building_gen INTEGER);
CREATE TABLE meta        (key TEXT PRIMARY KEY, value TEXT);  -- schema_version, lease, project_root
```

Notes:
- **Connection bootstrap**: start from codegraph's `sqlite-adapter.ts` (better-sqlite3-shaped
  wrapper over `node:sqlite`) + its PRAGMA set — `busy_timeout=5000` MUST be set first
  (before `journal_mode`), then `foreign_keys=ON, journal_mode=WAL, synchronous=NORMAL,
  cache_size=-64000, temp_store=MEMORY, mmap_size=256MB`. Large scans use `.iterate()`, never
  `.all()` (documented OOM class).
- **Exception to index-not-copy**: `memory` gist/detail and derived `concept` text live in the
  store — the store IS their source of truth. Everything else reads back via `locator`.
- Snippets/highlights: contentless FTS cannot render snippets; the projection layer builds
  excerpts from `locator` spans itself (we control excerpt shape anyway — token economy).
- Migrations: `meta.schema_version` + forward-only SQL files in `core/src/store/migrations/`;
  `ctx doctor` runs them.

## 3. Identity, Locators, Handles

**Stable entity IDs** (survive line edits; renames become links, not identity changes —
validated by counter-example: codegraph hashes the line number into its node ID and gets away
with it only because it wholesale-replaces a file's nodes on re-parse; our append-only `claims`
must resolve yesterday's subject today, so line/span is a mutable attribute, NEVER identity):

| kind | id scheme |
|---|---|
| file | `file:<repo-rel-path>` |
| symbol | `sym:<repo-rel-path>#<qualified.name>[~<arity/disambig>]` |
| commit | `commit:<oid12>` |
| pr / issue / story | `pr:<n>` / `issue:<key>` / `story:<key>` |
| decision | `adr:<path>#<slug>` or promoted `dec:<hash8>` |
| doc_section | `doc:<path>#<heading-slug-chain>` |
| memory | `mem:<ulid>` |

**Locator** (JSON discriminated union): `{t:'file',path,span?}` · `{t:'git',oid}` ·
`{t:'snapshot',carrier,file,ptr?}` · `{t:'store'}`. Read-through resolvers per `t` live in
`core/src/store/readthrough.ts`; every resolver re-checks `content_hash` and flags drift
(drift → entity marked stale, links flagged, serve discloses). Read-through hardening
(absorbed: understand-anything's dashboard file reader): traversal defense (null bytes,
absolute paths, `../` pre- and post-normalize), **allowlist cross-check against the store's
known entity paths**, size cap, binary sniff-reject. Write-boundary rule: **paths are always
persisted project-relative, never absolute** (one scrub function at the store writer). Store
shard placement resolves git worktrees to the main repo root (`--git-dir` vs
`--git-common-dir` divergence) — per-worktree data must not die with the worktree.

**Handles** — the drill-down currency (P25②). Two forms, both accepted by `context(handle)`:
- verbatim: `<entityId>` or `<entityId>!<facet>`
- short: `[k4f7a2]` — `k` = kind initial, then first 5 of blake2b(entityId+facet), collision-bumped;
  interned in `handles` on first emission (deterministic → stable across sessions).

Facets: `callers · callees · diff · text · detail · history · full`. Responses print short
handles (token economy: ~2 tokens vs ~15 for a long symbol id); `ctx recall <handle>` accepts both.

## 4. Ingest Framework

```ts
interface SourceAdapter {
  id: 'git' | 'code' | 'docs' | 'memory' | 'github' | 'jira' | 'confluence'
  dirtyCheck(store: Store): Promise<DirtyReport>          // target <20ms each
  ingest(store: Store, dirty: DirtyReport, budget: Budget): Promise<IngestResult>  // resumable
}
```

**Refresh orchestration** (P24 / D25 semantics, no daemon):
1. Serve path calls `refresh(sources, budgetMs)` before selection. First call per process is
   gated on catch-up but **time-boxed (3s, codegraph's constant)** — reconcile not done in time
   → serve anyway with RECONCILING; reconcile finishes in the background of the process's
   lifetime (a 100k-file repo must never present as a first-call hang).
2. All `dirtyCheck`s run concurrently: git = `git rev-list --count <storedTip>..HEAD` (a count,
   not a boolean — lets policy differ for 1 vs 500 commits behind); docs/code = file scan with
   **(size, mtime) pre-filter, content-hash confirm only on mismatch** (accepted blind spot:
   same-size same-mtime edits; `ctx sync --force` is the escape hatch); memory = always clean;
   network carriers = never dirty (snapshot-dated). Scans yield to the event loop every 1000
   files (serve path runs inline — must not block). A content-hash mismatch is further
   classified by **structural fingerprint** (reference: understand-anything `fingerprint.ts`,
   dependency-free TS): `COSMETIC` (structure identical: reformat/comment) →
   update hash, **skip all downstream re-linking/invalidation**; `STRUCTURAL` → full
   re-extract + invalidation cascade; unknown language → conservatively STRUCTURAL.
   An `extractor_version` stamp per row force-invalidates on extractor upgrades.
3. Dirty sources ingest inside the remaining budget, cheapest-first. Budget exhausted →
   remaining sources serve previous `published_gen` with `RECONCILING` in the envelope.
   Staleness is reported three-tier (codegraph's model, as structured envelope fields, not
   prose): entities-in-this-answer pending · other-things pending · whole-source frozen.
4. Cold paths (`ctx init/doctor/sync`, guide launch) run with a large budget (full catch-up).
5. Single-writer lease: `meta['lease'] = {holder, expiresAt}` (compare-and-set transaction,
   30s TTL, stealable on expiry). Readers never block (WAL + `published_gen` snapshot reads).

**Incremental correctness rules** (absorbed: gitnexus's incremental trio — the hardest bug
class is "a file that didn't change has stale derived data"):
- **1-hop boundary expansion**: the effective re-ingest set includes the unchanged-side file of
  every link crossing the changed-set boundary (a barrel re-export edit can redirect an edge
  whose endpoints' bytes never changed).
- **Shadow detection**: a newly added file triggers re-resolution of pre-existing files whose
  import/mention resolution it can steal (same basename/different ext, file-vs-directory-index).
- **Shrink guard**: an incremental pass producing a significantly smaller graph than the
  previous generation refuses to publish unless deletions were explicitly observed (catches
  silently-truncated extraction runs).

**Generation publish**: adapters write rows stamped `building_gen`; on success one transaction
flips `generations.published_gen`. Selection reads `WHERE gen <= published_gen` filtered views.

## 5. Extractors (per content type — deterministic only; semantic = on-demand, Inferred)

**5.1 Change history (git)** — carrier: subprocess `git` (no native dep):
- Walk: `git log --pretty=format:<fields> --name-status -z -M <cursor>..HEAD`; batch 200 commits
  per transaction. Commit entities use `{t:'git',oid}` locators — message/patch read back on demand.
- `touches` edges: `git diff --unified=0` hunk line-ranges (reference: gitnexus
  `parseDiffHunks`; 256MB maxBuffer against ENOBUFS) joined against symbol spans of the *post-image* file via one
  range-overlap SQL per file (needs code source; until then file-level). Rename chains: `-M`
  detections → `rename-tracked` links (`file:` identity is path-based; the chain preserves
  history continuity). NOTE: no reference project mines commit history as content — this
  extractor is greenfield; only the primitives above have precedent.
- Co-change: sliding window (default: last 500 commits or 90 days, disclosed in envelope);
  pair support ≥3 → `co-changed` link, `confidence = P(B|A)` (max of both directions). Incremental:
  window recomputed only when new commits arrive; O(window) not O(history). (Mining confirmed:
  no reference project implements co-change — this design is ours alone.)
- Trailers & keys: `Fixes|Closes #N`, `[A-Z]+-\d+` issue keys, `Decision:` trailers →
  explicit-key links (Observed).

**5.2 Code structure (tree-sitter, + SCIP when present)**:
- Per-language `.scm` query files: definitions (function/class/method/const), imports, call sites
  (best-effort callee identifier), doc comments. Tier-1 set: TS/TSX/JS, Python, Go, Java, Rust, C#.
  Seed the query strings from tree-sitter-analyzer's 19 per-language query modules (plain
  tree-sitter query syntax, runtime-agnostic; includes docstring + framework-aware
  `#match?` patterns) — ours to prune and extend. Two hard rules absorbed with them: **never slice source text by
  tree-sitter byte offsets** (UTF-8 byte vs string index corruption — use `node.text`; multibyte
  regression test on day one), and **callee resolution never binds across languages** even on
  exact name match (per-language resolver registry with `{local,project,builtin,unknown}`
  outcomes; ambiguous → unknown, conservative by construction).
- Symbol spans + `content_hash` per symbol (hash of span text) → memory-anchor invalidation is
  a hash comparison at dirty time.
- Call edges are `structural` claims (Derived — tree-sitter cannot resolve dispatch); SCIP
  (when `index.scip` exists) upgrades identity/references to Observed; tree-sitter×SCIP overlap
  goes through arbitration (same-predicate jurisdiction).
- **Grammar packaging RESOLVED (absorbed: codegraph)**: `web-tree-sitter` (pure WASM) +
  `tree-sitter-wasms` package, vendored `.wasm` overrides where the npm build is broken —
  zero native addons, zero node-gyp (distributed-field rule satisfied). Operational rules that
  ride along: grammars load **sequentially** (documented WASM race on Node 20+), **lazily**
  (only languages present in the changed set), parser instance recycled every 5000 parses
  (WASM heap fragmentation), parsing isolated in a `worker_threads.Worker` that exits on WASM
  memory corruption and is respawned (a corrupted module poisons all later parses).

**5.3 Decisions**: ADR/design docs — frontmatter (`status/date/supersedes`) + heading parse →
decision entities; `supersedes` → explicit-key links. Commit trailers (5.1). PR threads
(GitHub snapshots) → `doc_section` entities (searchable text, Observed); promotion to decision
entities ONLY via explicit markers (`Decision:` blocks) or on-demand LLM proposal (Inferred, P23).

**5.4 Requirements/stories**: Jira snapshot → story entities (key/title/status/description
locator into snapshot file); explicit keys ↔ commits/PRs. Local requirement docs = docs pipeline.

**5.5 Domain/doc knowledge**: markdown heading tree → `doc_section` entities (span locators);
glossary patterns (definition lists, `**Term** — def` lines) → concept claims; **mention
resolution**: backticked identifiers + path-likes matched against entities → `references` links
(`path-match`/`symbol-match`, Derived) with **two-tier resolution** (exact relative path →
basename fallback, lower confidence); unresolved mentions stored as `stale-suspect` conflicts →
guide's stale-reference list. Staleness is **reason-classified, never boolean** (absorbed:
repodoc/repoagent): `target-removed · signature-changed · body-changed · referencer-changed ·
never-resolved` — the review queue treats each differently. (Note: no reference project parses
frontmatter/glossaries at all — this extractor is unclaimed territory, same as the evidence
drawer.)

**5.6 Memory**: `remember(note, anchors?, supersedes?)` → mem entity (gist cap enforced; anchors
resolved to entity ids; supersede = explicit link, old entry kept). Host importers: Claude Code
(`~/.claude/projects/<shard>/memory/`), Codex, Copilot locations (⛏ verify exact paths per host);
echo exclusion = skip ctx-managed sentinel blocks; scope filter = project-path match; imports are
always Inferred with `host-import:<host>` origin; cross-host near-dupes → `sameAsCandidate`.
Dedup identity rules (absorbed: graphify `dedup.py` — port the rules, simplify the
machinery): code-kind entities are identity-keyed by ID, NEVER fuzzy-merged by name; fuzzy
matching applies to memory/concept kinds only, gated by an entropy floor (short/low-entropy
gists never fuzzy-match) and a differing-embedded-number guard ("ADR 0011" ≠ "ADR 0013");
dedup never crosses project boundaries; and per P21, matches only ever produce
`sameAsCandidate` links — never destructive merges.

## 6. Selection Engine (`core/src/select/`)

Pipeline (all constants live in `select/constants.ts`, envelope-disclosed):

1. **Seeds**: task mode → identifier-aware tokenization (reference: codegraph
   `query-utils.ts`: camel/snake/dot splitting that keeps the compound token too, English-suffix
   stem variants, project-name down-weighting, `isDistinctiveIdentifier` exact-match gating,
   tuned stopword list), then FTS5 bm25 top-64 — scoring sums only the **top-3 matches per
   file** (stops many-mediocre-hits files outranking one-sharp-hit files) — plus **named-seed
   injection**: every identifier-shaped query token also resolves via the direct name index and
   is force-included with a large seed weight (FTS cutoffs must not drop symbols the agent
   explicitly named). Kind bonuses (class/function/method small boost, import demoted) and
   test-file demotion unless the query is about tests. ref/handle mode → the entity itself.
2. **Subgraph**: frontier expansion over `links` (all predicates), depth ≤2, node cap 512,
   frontier priority = parent score × edge confidence.
3. **PPR** (start from codegraph's production-tuned constants): undirected adjacency over the
   subgraph, restart probability α=0.25, 25 power iterations, dangling nodes keep their mass,
   teleport vector = normalized seed scores with uniform fallback if no seed landed.
   Post-multipliers: time decay for history/memory kinds only (`exp(-age/90d)`), confidence
   soft factor (`0.5 + 0.5·conf`; per-predicate confidence floors when a link has none), memory
   authority boost (confirmed ×1.3). Code kinds never time-decay.
   Final ranking fuses PPR-ranked graph hits with raw lexical hits via **Reciprocal Rank
   Fusion** (RRF, K=60 — reference: gitnexus `hybrid-search.ts`, self-contained): robust to the
   two scales being incomparable.
   **History-heat boost** (absorbed: repomaster weights git signals highest of all its ranking
   signals): code entities get `× (1 + 0.5·heat)` where
   `heat = min(commits_90d/20, 1)·0.7 + recency·0.3` — computed free from the git source's
   `touches` edges. Ranking is always a composite (graph × lexical × heat), never single-metric.
4. **Sections**: bucket by content type; per-section caps (defaults, lean tier ≈1200 tokens
   total: subject 15%, code 30%, decisions 15%, history 15%, memory 10%, conflicts 10%,
   envelope 5%); **marginal-utility borrowing**: unused section budget flows to the globally
   highest-scored omitted item. **Conflicts are never squeezed** — if answer-relevant conflicts
   exist they preempt other sections' borrowing.
5. **Projection**: kind-specific renderers emit compact lines (§7); token estimate = chars/4;
   every omission counted + handle'd in the envelope. No silent truncation, ever.
   Absorbed rules (repomaster / pi-context-prune / bash-agent):
   - **Three render tiers per item**: full (top-relevance) → skeleton (signature + first
     doc-comment line, no body — medium relevance) → line+handle (the rest). Cut on semantic
     boundaries; hard-stop, never truncate mid-item.
   - **Omit-with-handle beats degraded-inline**: filling the last bytes of budget with low-value
     items is a quality cost, not a win — below a marginal-score floor, emit the handle line even
     when the item would fit.
   - **A summary must be smaller than what it replaces**, else include the original or the handle.

`search()` = stages 1–2 + flat ranked render. Facet drill-downs (`!callers` etc.) skip PPR and
render the facet directly with its own ~800-token budget.

## 7. Serving Surface

**MCP server** (`ctx mcp`, stdio; host-namespaced clean verbs):

```ts
context({ ref?: string, task?: string, handle?: string, budget?: 'lean'|'wide' })
search({ query: string, kinds?: Kind[] })
remember({ note: string, anchors?: string[], supersedes?: string })
```

Serving rules (absorbed: codegraph's empirically-earned lessons + gitnexus's result-shape
convention):
- **Never `isError` for recoverable conditions** (not-indexed, ref-not-found, budget-degraded):
  return a success-shaped response carrying guidance — one or two `isError`s early in a session
  teach the agent to abandon the tool permanently.
- **Precise output needs precise input**: refs/handles are the primary key space; task-mode NL
  resolves to explicit anchors before answering (codegraph removed its fuzzy-text tools after
  agents under-picked them — independent validation of the 3-tool handle design).
- **`truncated` vs `partial` are distinct envelope fields**: capped-but-valid subset vs
  sub-query-failed-do-not-trust-as-clean. They must never look the same.
- **~24K-char hard ceiling** on any single inline response (above ~25K some hosts externalize
  the result to a file and force a Read-back — reintroducing the read we exist to avoid).
- Source lines are `N⇥code` numbered exactly like the host Read tool (agents cite file:line
  without re-reading); ambiguous refs return ALL candidate definitions in one response (never
  make the agent guess-and-retry); section labels use bold+codespan, never `#` headings (host
  renderers blow ATX headings up to H1).
- **Response shape is stable call-over-call** (sections appear in fixed order, only content
  varies) — tool results sit in the client's cacheable context.

Response = ONE markdown text block (never JSON envelopes — token economy), format:

```
# ctx · processOrder — fresh (git RECONCILING)
## code
fn processOrder(order) src/orders/process.ts:42 [s4f7a2]
  → validate [s9b1c3] · persist [s2d8e4] · +3 more [s4f7a2!callees]
## decisions
2026-05-12 ADR-014 orders must be idempotent (confirmed) [d7a1b2]
## history
2026-06-28 a1b2c3 "fix double-charge on retry" @wang [c3e5f1]
## memory
⚠ retry queue drops metadata on redelivery — see [m8c2d4]
## conflicts
⚡ ADR-014 says idempotent [d7a1b2] ↔ retry path re-executes side effects [s4f7a2!diff]
## omitted
history 12 [s4f7a2!history] · docs 3 · (co-change window: 500 commits)
```

**Push** (`core/src/push/`): block builder renders ≤1KB (header included):

```
<!-- ctx:managed:begin -->
This project has a ctx context base (code, decisions, history, memory — with provenance).
Start tasks with the `context` MCP tool; drill down by passing back any [handle].
Gotchas: <top-N auto-ranked gists, one line each, [handle]>
<!-- ctx:managed:end -->
```

Host adapters own placement: Claude Code → managed block in project `CLAUDE.md`; Codex →
`AGENTS.md`; Copilot → `.github/copilot-instructions.md` (⛏ verify current per-host auto-load
surfaces at build time). Rendered on cold paths + optional git post-commit hook. Pin/veto =
`.ctx/push.jsonc` in the project (git-shareable, D27/D30).

**Guide** (`ctx guide`): Hono loopback server (random port + bearer token) exposing `core` query
endpoints + static React bundle. Pages: Overview / Entity Biography (flagship — the human twin of
`context(ref)`) / Decisions / History / Knowledge (review queue + stale references + push state)
/ Search. Evidence drawer on every fact (claim → carrier/locus/method/authority/at). Strictly
read-only; lifecycle commands are displayed, not executable (P23). Snapshot export = one
self-contained HTML shell + JSON data files + client-side render (same components as live mode —
never maintain two render paths). Mining verdicts baked in: the evidence drawer and cross-source
Search have **zero precedent** in the five wiki reference projects (both are differentiators
built from scratch; the cohort's "LLM prose with decorative citations" is the failure mode we
exist to avoid); reference pieces: deepwiki-open `Mermaid.tsx` (render lifecycle +
error-fallback + pan-zoom) and `WikiTreeView.tsx` (collapsible nav), excluded-dirs seed list
(with its `docs/` exclusion REVERSED — docs are a first-class source for us).

**On-demand Inferred generation rule** (absorbed: codewiki's strongest pattern): every LLM
artifact we request (decision-node proposals, business-logic view sections, diagrams) gets a
**cheap deterministic validator whose errors feed back into the same generation turn** (parse
the Mermaid, resolve the cited entity ids, check the claimed anchors exist) — self-correction at
zero extra orchestration. Derived "business logic view" section vocabulary seeds from
deepwiki-open's convergent list (overview/architecture/features/data-flow/deployment) but is
grounded in OUR entities with real handles, never free-floating prose.

**CLI**: `ctx init · doctor · mcp · guide · import <carrier> · sync ·
remember "<note>" · recall <handle> · memory confirm|retire <id> · push pin|veto <id>`.
Env `CTX_HOME`, data `~/.ctx/`. (`ctx run <cmd>` and tk-era compat arrive with the adjacent
absorption track, §8 — not before.)

## 8. Adjacent Track: Compressor Absorption (off the critical path)

The shipping compressor keeps running from its current tree, untouched, while M1–M5 proceed.
Any time after M1, this track absorbs it — nothing in M1–M5 depends on, waits for, or is
reordered by it:

- Hook rewrite target becomes `ctx run <cmd>`; `tk` becomes a bin alias;
  `TOKEN_KILLER_HOME` honored read-only; `--raw` switches to `stdio:'inherit'`.
- Ledgers jsonl → `ledgers.sqlite` (own file beside `store.sqlite` — hot-path write isolation);
  never-summed read invariant covered by migration regression tests. Session dedup HIT
  responses gain recall handles.
- Command outputs stay session-scoped; the tap contributes `session_ref` provenance for memory
  entries created during a session.

## 9. Build Route (optimal path from the product; maintainer-ratified 2026-07-03)

Route logic: the agent's scarcest context is the INVISIBLE kind — why (decisions), what
happened (history), what we learned (memory). None of it is reachable by grep/read; all of it
ships in M1 with the full serving surface (pull AND push). Code — which agents can already
read — joins the graph in M2 for symbol precision. Every milestone leaves the product
shippable; slices within a milestone are independently mergeable.

**M1 — The base speaks** (first shippable: differentiated context, cross-host, both channels)

| # | Slice | Lands |
|---|---|---|
| 1a | Scaffolding | pnpm workspace, packages/{core,cli}, tsdown/vitest, copy-assets (.sql/.scm/.wasm), 3-OS CI |
| 1b | Store spine | DDL, migrations, generations+lease, handles, read-through resolvers (+hardening), worktree-aware shard placement |
| 1c | Memory source | remember/recall, host importers (Claude Code/Codex/Copilot), echo exclusion, dedup rules, lifecycle CLI |
| 1d | Git source | cursors, commit entities, file-level `touches`, rename chains, trailers/issue keys, co-change; `ctx sync` |
| 1e | Docs/decisions source | markdown/frontmatter/ADR/glossary extractors, two-tier mention resolution, link layer v1 (explicit-key + path-match), conflicts + reason-classified stale-suspects |
| 1f | Selection engine | FULL pipeline in one build (P25④): seeds → expansion → PPR → sections+borrowing → projection with render tiers |
| 1g | MCP serve | 3 tools + envelope + serving rules (§7), golden transcripts |
| 1h | Push | digest builder + host adapters + pin/veto; ≤1KB property test |
| 1i | init/doctor | cold-path full catch-up, store assertions, push placement checks |

M1 acceptance: on a fixture repo, any MCP host resolves "why was X changed & what do we know
about it" in ONE `context()` call with citations; push block present in all three hosts;
`dirtyCheck` <20ms warm; `context()` <150ms warm. Dependency: 1b → {1c,1d,1e} parallel →
1f/1g → 1h/1i.

**M2 — Code joins the graph** (symbol precision + full 鉴真)
tree-sitter WASM scaffold + tier-1 queries · symbol entities/spans/hashes · `touches` upgraded
to symbol level · callers/callees facets · mention→symbol resolution · memory-anchor
invalidation via structural fingerprint (COSMETIC/STRUCTURAL) · incremental correctness trio
(1-hop boundary, shadow detection, shrink guard) · tree-sitter×SCIP arbitration.
Acceptance: symbol biography via `context(ref)` incl. symbol-level history + anchored memory;
anchor-drift test; per-language parity fixtures; multibyte span regression.

**M3 — Humans see it** (guide, full page set — maintainer: no cut)
Loopback server + Overview / Entity Biography / Decisions / History / Knowledge / Search +
evidence drawer + snapshot export (single shell + JSON, one render path).
Acceptance: Playwright smoke; every displayed fact traces to claim provenance; export diff test.

**M4 — Org context flows in** (network carriers, ingress-only)
GitHub PR/issue → Jira (stories + decisions) → Confluence (domain docs); dated snapshots;
cross-carrier arbitration live.
Acceptance: snapshot fixtures; ingress-only lint (no outbound writes anywhere); conflicts
across carriers surface in `context()` and guide.

**M5 — Hardening + free instrumentation** (record-only, features-before-measurement)
Perf-gate enforcement (§10), served/usage counters, omitted-handle drill-down rate (the free
retrieval-quality proxy), budget/envelope property tests.

**Adjacent track** (any time after M1, never blocking): compressor absorption (§8).

## 10. Testing & Perf Discipline

- Fixture repos generated by script into temp dirs (Windows: rm with retries — EBUSY);
  spawn tests get explicit timeouts (CI cold-start tax is known).
- Golden transcripts: every serve surface has recorded input→output fixtures; format changes are
  reviewed diffs, not silent drift.
- Perf gates (distributed-field first): `dirtyCheck` <20ms warm; `context()` end-to-end <150ms
  warm on a 10k-commit/2k-file repo (M-series + mid Windows box); store size <5% of repo size
  (index-not-copy makes this achievable).
- Property tests: budget never exceeded; envelope omission counts always reconcile; append-only
  claims never mutated.

## 11. Rollback & Failure Handling

Everything is additive and local: bad store → `rm -r ~/.ctx/projects/<shard>` + `ctx sync`
(sources are authoritative — index-not-copy means nothing is lost). Push blocks are
sentinel-wrapped → removable by `ctx doctor --remove-push`. Importer snapshots are dated dirs —
delete = revert. No migration ever rewrites a source file outside managed blocks.

## 12. Absorption Register (mining round 2026-07-03, 5 reports, 12 repos — COMPLETE)

> **Stance (maintainer, 2026-07-03): all reference code is REFERENCE, not gold standard.**
> License flags are ignored entirely. Every entry below is a starting point that saves
> derivation time — adapt, rewrite, or discard freely wherever our design (§1–§11) says
> otherwise; when reference code and this document disagree, this document wins.

Techniques already integrated inline above (§2–§7): codegraph PPR constants + freshness gate +
serving rules; gitnexus incremental trio + RRF; graphify dedup rules + shrink guard; repomaster
composite ranking + render tiers; understand-anything fingerprint + read-through hardening;
tree-sitter-analyzer queries + dirty-check; pi-context/bash-agent response-shaping rules;
wiki-cohort invalidation + validator-feedback pattern.

**Reference map** (`lift` = usable near-verbatim as a starting point; `port` = take the
technique, rewrite the code):

| Source | Files/functions | Use |
|---|---|---|
| codegraph | `src/db/sqlite-adapter.ts` (node:sqlite wrapper); `configureConnection` PRAGMAs; `src/search/query-utils.ts` (tokenize/stem/stopwords/name-downweight); `numberSourceLines` + section-prefix formatting; staleness banners (→ structured fields) | lift |
| codegraph | `computeGraphRelevance` (PPR); budget tiers (~24K ceiling); fs-reconcile `sync()`; catch-up gate; `grammars.ts` WASM loading; `parse-worker.ts` isolation; BUNDLING.md vendored-Node + optionalDependencies packaging | port |
| gitnexus | `git-staleness.ts` (rev-list count); `parseDiffHunks` + git.ts hardened helpers; `subgraph-extract.ts` + `shadow-candidates.ts` (incremental trio); `hybrid-search.ts` (RRF, self-contained) | lift (off their graph API) |
| gitnexus | `detectChanges` range-overlap→symbol; `truncated`/`partial` convention; per-predicate confidence floors | port |
| graphify (Python) | `dedup.py` identity rules; `cluster.py` seeded/stable communities; `watch.py` lock+pending-queue+shrink-guard; `analyze.py` graph_diff; centrality node-count gates | port |
| understand-anything | `fingerprint.ts` (NONE/COSMETIC/STRUCTURAL); `tree-sitter-plugin.ts` scaffold (WASM init/degrade/delete); `language-registry.ts` | lift |
| understand-anything | `readSourceFile()` path-safety+allowlist; `sanitiseFilePaths`; worktree detection; `schema.ts` tolerant-validation (for `remember()` input) | port |
| tree-sitter-analyzer (Python) | `queries/*.py` query strings (19 langs → our `.scm`); `ast_index`+contentless-FTS5 DDL | lift |
| tree-sitter-analyzer | two-stage dirty-check; parallel indexing heuristics (<64 files sequential, JSON-only workers, single writer); search cascade + kind bonus; callee-resolution registry | port |
| deepwiki-open | `Mermaid.tsx`; `WikiTreeView.tsx`; excluded-dirs seed (docs-exclusion REVERSED); Mermaid prompt cheat-sheet | lift |
| repomaster (Python) | composite importance weights; AST-skeleton tier; greedy budget-fill; 5K-token search degradation | port |
| davia | `web.ts` port-detect/open/graceful-shutdown for guide server | lift |
| codewiki, repodoc (Python) | invalidation cascade shape; validator-feedback loop; two-tier link resolution; change-type classification | port |

**Validation-by-absence** (things NO reference project has — our differentiators, greenfield):
git history as ingested content + co-change analytics; per-fact evidence/provenance surface;
cross-source search; deterministic doc/frontmatter/glossary extraction; non-LLM importance
ranking (cohort delegates to LLMs); stable cross-edit symbol identity (both graph tools get it
wrong — ours is designed in §3); MCP token-budget/handle/envelope surface.

**Empirical validations of ratified decisions**: codegraph removed its fuzzy-text tools
("precise output needs precise input") → 3-tool handle design; codegraph runs a daemon ONLY for
multi-host attach — documented as the future reference architecture if that need ever
materializes, stays out of scope (P24); UA fled native tree-sitter bindings on darwin/arm64 →
WASM decision confirmed from two independent directions.
