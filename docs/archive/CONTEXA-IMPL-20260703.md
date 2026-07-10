> **SUPERSEDED 2026-07-10** by the root `CONTEXA-IMPL.md` (implementation register reconciled to `PRODUCT-DESIGN.md`). The old M1–M5 route is superseded by M-plan v2; claim dispositions are in the new register Appendix C.

# Contexa — Implementation Design

> **Status: implementation-step output**, derived independently from `CONTEXA-DESIGN.md` (P15–P25)
> and first principles only. Prior implementation docs (`docs/codemap/impl/*`, `schema-draft.sql`)
> were deliberately NOT used as input (maintainer instruction 2026-07-03); where they conflict,
> this document wins unless the maintainer says otherwise. `.research/` mining results feed the
> **Absorption Register** (§12) — slots marked `⛏` await those reports.
>
> Language: TypeScript, Node ≥22.5 (`node:sqlite` stable; no upper bound — the old <25 WASM
> ceiling is re-verified at M2 start; P28), pnpm. All techniques adopted directly (P25④);
> ordering below is Implementation dependency only.
>
> **Route principle (maintainer, 2026-07-03)**: the build route is the OPTIMAL PATH from the
> product definition — measured from the consumer's seat. Explicitly NOT route inputs: the
> current Contexa compressor codebase, the compressor, the June contract's slice DAG, and any reference
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
  cli/         # `ctx` bin: install/doctor/mcp/guide/import/remember/recall/memory/push/sync
  guide/       # React + Vite web app; served by cli via loopback Hono server
```

Rules: `core` never spawns long-lived processes; `core` never imports from `cli`/`guide`;
everything user-visible goes through `cli` or a host adapter. MCP server = ~50-line shim in
`cli` over `core/serve` (the host keeps it resident per session — the only per-call-spawn-free
channel we get without a daemon).

## 2. Store — concrete DDL

One DB per project shard: `~/.contexa/projects/<shard>/store.sqlite` (WAL). Requires SQLite ≥3.43 semantics
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
-- `unresolved-here` is NOT a conflict row: it is a derived, per-machine/per-branch anchor
-- annotation (target not resolvable here — un-imported ③ snapshot or branch-absent symbol),
-- kept strictly disjoint from `stale-suspect`. For an absent local target the split is
-- deterministic via the committed anchor line's `anchored-at:<commit-id>` (author HEAD at
-- remember-time): `git merge-base --is-ancestor <anchored-at> HEAD` → ancestor = target-removed
-- drift = stale-suspect; not-ancestor = branch-absent = unresolved-here. Never keyed on local
-- index history (E6). See MEMORY-SYNC-SETTLEMENTS.md S4/S9.

-- DERIVED INDEX over committed .contexa/memory/ files (B1/C3) — regenerable, never source of truth.
-- gist/detail read through to committed files; `status` is the deterministic fold over the
-- append-only decision log (order (timestamp, ULID), E2/E5), cached here for fast reads, never
-- hand-mutated. `origin` distinguishes the landing zone (E3: host-import lands overlay/needs-review).
CREATE TABLE memory (
  entity_id    TEXT PRIMARY KEY REFERENCES entities(id),
  gist         TEXT NOT NULL,                  -- hard cap 240 chars, enforced at write
  detail       TEXT,                           -- read-through to .contexa/memory/details/<ulid>.md (S1)
  origin       TEXT NOT NULL,                  -- remember|host-import:<host>|human-note
  session_ref  TEXT,
  authority    TEXT NOT NULL,                  -- inferred|confirmed
  status       TEXT NOT NULL DEFAULT 'active', -- active|needs-review|superseded|retired (folded)
  valid_from   INTEGER,                        -- C5 bitemporal; explicit args / supersede-time only
  valid_to     INTEGER,                        -- C5; never inferred
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
- **Index-not-copy is now total (B1/C3)**: the former exception is retired. `memory` and `concept`
  read back through committed `.contexa/memory/` and `.contexa/concepts/` files via `locator` like every
  other local carrier; the store rows are a rebuildable index. Determinism target = canonical
  logical equality across machines (E6), not byte-identical SQLite; `store.sqlite` is gitignored.
- Snippets/highlights: contentless FTS cannot render snippets; the projection layer builds
  excerpts from `locator` spans itself (we control excerpt shape anyway — token economy).
- Migrations: `meta.schema_version` + forward-only SQL files in `core/src/store/migrations/`;
  `ctx doctor` runs them.
- **Generation identity (D32/ADR 0040 carried)**: a published generation is identified by the
  tuple (source cursor position, `extractor_version`, `schema_version`, analysis-policy rev in
  `meta`) — never a bare counter; any element changing ⇒ new generation.

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
4. Cold paths (`ctx install/doctor/sync`, guide launch) run with a large budget (full catch-up).
   File scans honor the carried D13 default ignore-set (~50 build/cache dir names; `docs/` is
   explicitly NOT excluded) — seed list at `docs/codemap/impl/D-language-coverage.md:618`.
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

**5.6 Memory** (file-backed event model — B1/C1/C2/E2/E3/E4): every write is an **immutable event**
appended to a committed (or overlay) markdown log, never an in-place row mutation. `remember(note,
anchors?, supersedes?)` appends one entry line (gist cap enforced; anchors resolved to entity ids;
multi-line detail → a write-once `.contexa/memory/details/<ulid>.md` sidecar, S1) plus, for a supersede,
a **decision-log** event in `.contexa/memory/decisions.md` (append-only, C2: who / when / verdict /
reason / refs); the old entry is kept, status is **derived** from the fold over the decision log
(E2/E5), not overwritten. Lifecycle verbs (`confirm/retire/supersede/dismiss`) and conflict
resolutions are the same shape — an appended, provenance-carrying decision event (C4; resolutions
themselves supersedable) — never a hidden DB mutation. **Write scope + landing zone, by caller surface (E3/E4/A4):** **CLI
`remember()` = human-authored** → committed Mainline default (`--local` → personal overlay); **MCP
`remember()` = agent-authored** → personal overlay as `needs-review`, promoted to a committed
Mainline event only on human confirmation (same pipeline as host imports; A4 keeps lifecycle
human/CLI-only). **Host imports likewise land in the personal overlay / local index only, as
`needs-review` (E3).** Confirmation is the act that appends the committed Mainline event — nothing
auto-generated reaches git unreviewed. **Secret guard (E4):** a deterministic secret-shaped regex guard
(`sk-` keys, tokens, passwords, credentials) runs **before** anything enters the committed zone → a
success-shaped refusal with guidance (never a hard error, no LLM/network); a per-repo opt-out
disables committing memory entirely. Host importers (⛏ RESOLVED
— P28 official-docs verification 2026-07-04): **Claude Code** `~/.claude/projects/<shard>/memory/`
(MEMORY.md index + per-topic .md; confirmed official) — M1. **VS Code Copilot** memory tool
(PREVIEW): user scope `<globalStorage>/github.copilot-chat/memory-tool/memories/*.md`, repo scope
`<workspaceStorage>/<hash>/…/memories/repo/*.md` (reverse-map the hash via that dir's
`workspace.json`; SKIP when the `chat.copilotMemory.enabled` cloud experiment routes repo
memories to CAPI — nothing lands locally); session scope has a 14-day TTL — importer =
follow-on with a preview-path guard. **Copilot CLI**: NO local memory store (verified negative —
nothing to import; `~/.copilot/session-state/` is replay JSONL, not memory). **Codex CLI**:
`~/.codex/memories/` markdown workspace (feature off by default; contains its own `.git`) +
sessions JSONL with embedded cwd — follow-on;
echo exclusion = skip ctx-managed sentinel blocks; scope filter = project-path match; imports are
always Inferred with `host-import:<host>` origin and **land in the personal overlay as
`needs-review` (E3)** — never a committed Mainline event until a human confirms; cross-host
near-dupes → `sameAsCandidate`.
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
- **`assertNoEgress()` (D22 carried)**: core actively refuses egress — serve/ingest paths assert
  that no egress-capable API-key env is consumed; mechanism spec at
  `docs/codemap/impl/M-cross-cutting.md` (M14).
- **Push ranking reads shared **merged with** personal** (three-tier scope, D27/E3): the shared
  `.contexa/push.jsonc` (pin/veto — project presentation) merged with the gitignored personal overlay
  (`.contexa/*.local.*` — my-view mute/pin). Personal attention never mutates the shared config and is
  never forced on the team; a pin only orders already-eligible items (A2), veto always wins.
- **Two disjoint anchor states on served memory** (never conflated): `stale-suspect` = drift, a
  reason-classed conflict (needs-review for `target-removed`/`signature-changed`, down-rank for
  `body-changed`, A5/E7) — the target is present but its `content_hash` differs, or (absent target)
  its committed `anchored-at:<commit-id>` **is an ancestor of HEAD** (`git merge-base --is-ancestor`);
  `unresolved-here` = a derived, per-machine/per-branch annotation for an anchor **not resolvable
  here** (un-imported ③ snapshot, or an absent local target whose `anchored-at` is **not** an ancestor
  of HEAD), rendered with an import hint (`run \`ctx import <carrier>\``), **never** treated as stale
  and never flipped to needs-review by drift. The split is deterministic across peers (git graph, not
  local index — E6). Settled: `docs/build/MEMORY-SYNC-SETTLEMENTS.md` (S4/S9).
- **Secret guard on the `remember` write path (E4)**: a deterministic secret-shaped regex guard
  (`sk-` keys, tokens, passwords, credentials) runs before anything enters the committed zone → a
  success-shaped refusal with guidance, never an `isError`; there is no LLM/network to lean on.

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

Host adapters own placement (⛏ RESOLVED — P28 verification 2026-07-04): root `AGENTS.md` is
natively auto-loaded by Codex CLI, Copilot CLI (primary) AND VS Code Copilot (default-on since
1.104); root `CLAUDE.md` is Claude Code's surface and is ALSO auto-read by both Copilot hosts;
`.github/copilot-instructions.md` stays always-on for Copilot. **Two managed files
(`AGENTS.md` + `CLAUDE.md`) cover all four hosts** — per-host adapters may still choose the
host-canonical file, but the two-file default is the floor. Rendered on cold paths + optional git post-commit hook. Pin/veto =
`.contexa/push.jsonc` in the project (git-shareable, D27/D30).

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
grounded in OUR entities with real handles, never free-floating prose. The generation prompt
itself seeds from openwiki's `src/agent/prompt.ts` (§12) — its documentation-discipline clauses
are near-liftable as our on-demand spec: ground every claim in source/git evidence, explain WHY
not WHAT, flag doc↔source conflicts, one canonical home per concept, surgical
docs-impact-plan updates (source change → affected → edit → why), no-op when nothing changed.

**CLI**: `ctx install · doctor · mcp · guide · import <carrier> · sync ·
remember "<note>" · recall <handle> · memory confirm|retire <id> · push pin|veto <id>`.
**`ctx install` owns host integration (P28)**: managed writes of the MCP-server registration
into each host's MCP config AND push-block placement; `ctx doctor` verifies both (read-only) —
reuse the shipping tree's host path-resolution (`src/hook/copilot.ts`, `src/shim/hostAdapter.ts`)
as reference for per-host locations.
Env `CONTEXA_HOME`, data `~/.contexa/`. (`ctx run <cmd>` and legacy compressor compat arrive with the adjacent
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
| 1b | Store spine | DDL, migrations, generations+lease, handles, read-through resolvers (+hardening), worktree-aware shard placement, **`Store` TS interface + `SourceAdapter` registry + §4 refresh-orchestration engine** (pinned here so 1c/1d/1e build against one contract) |
| 1c | Memory source | remember/recall, importer framework + Claude Code importer; VS Code Copilot / Copilot CLI / Codex importers gated on the P28 official-docs verification pass (each an independently mergeable follow-on), echo exclusion, dedup rules, lifecycle CLI |
| 1d | Git source | cursors, commit entities, file-level `touches`, rename chains, trailers/issue keys, co-change; `ctx sync` |
| 1e | Docs/decisions source | markdown/frontmatter/ADR/glossary extractors, two-tier mention resolution, link layer v1 (explicit-key + path-match), conflicts + reason-classified stale-suspects |
| 1f | Selection engine | FULL pipeline in one build (P25④): seeds → expansion → PPR → sections+borrowing → projection with render tiers |
| 1g | MCP serve | 3 tools + envelope + serving rules (§7), golden transcripts |
| 1h | Push | digest builder + host adapters + pin/veto; ≤1KB property test |
| 1i | install/doctor | **host MCP registration (managed per-host config writes; P28)**, cold-path full catch-up, store assertions, push placement checks |

M1 acceptance: against a **generic MCP stdio client fixture** (real-host integration is a manual
checklist, not CI — hosts aren't installable in CI), "why was X changed & what do we know
about it" resolves in ONE `context()` call with citations; push adapters write correct content
to correct paths in a fixture project dir for all three hosts; `dirtyCheck` <20ms and
`context()` <150ms warm on the §10 fixture repo. Dependency: 1b → {1c,1d,1e} parallel →
1f/1g → 1h/1i. **Executable acceptance bar: `docs/build/M1-ACCEPTANCE.md`** (reviewer-owned;
this repo = living acceptance fixture); implementer goal prompt: `docs/build/M1-GOAL-PROMPT.md`.

**M1 spec addenda (P28, 2026-07-04 buildability review — conventions pinned so parallel slices
share one contract; each lands with its slice):**
- Envelope is an internal typed struct; markdown is the final render step (§10's
  omission-reconciliation property tests target the struct, never the rendered string).
- Error taxonomy: success-shaped guidance for ALL recoverable conditions (§7 rule); real
  `isError` only for malformed arguments and store corruption.
- `budget:'wide'` = 3× lean caps, same percentages, until measurement says otherwise (FORK-3).
- Handle collision bump = extend the blake2b prefix 5→6→7 chars. Facet applicability: code kinds
  `callers·callees·diff·history·full`; commit `diff·text`; doc/decision/story `text·history`;
  memory `detail·history`; no facet = default brief.
- `.contexa/push.jsonc` = `{ "pin": [ids], "veto": [ids] }`; comments allowed; unknown keys rejected
  with guidance.
- Docs classification: frontmatter `type:` wins → path convention (`docs/adr|decisions/`,
  `*.adr.md`) → heading heuristic; the applied rule is disclosed in provenance.
- Stale reason-classes reachable in M1 = `target-removed · referencer-changed · never-resolved`
  (`signature/body-changed` need M2 symbol hashes — do not attempt earlier).
- Shard key = 12 hex of blake2b over realpath(`git rev-parse --git-common-dir`); fallback
  realpath(project root) for non-git dirs.
- Migrations = `NNN-<name>.sql`, forward-only, one transaction each; `schema_version` = highest
  applied NNN.
- `remember()` validation: gist hard-capped at 240 chars (longer note → success-shaped guidance
  to split note/detail); unresolved anchors → success-shaped response listing candidate entities
  (entry not written until anchors resolve or are dropped by the caller).
- `ctx import`/`ctx guide` before their milestone → success-shaped "lands at M4/M3" notice,
  never unknown-command.
- Echo-exclusion acceptance bar (1c): exact sentinel-block match only; paraphrase echo is
  explicitly out of M1 scope.
- `ctx sync` = all-sources orchestration entry point (not git-only, despite landing with 1d).
- Package names: placeholder scoped names + `"private": true` until P13 naming lands;
  `pnpm-workspace.yaml` gains `packages/*`; per-package tsdown `.ts` configs (Node ≥22.5 allows
  it) — root legacy Contexa configs untouched.

**M2 — Code joins the graph** (symbol precision + full 鉴真)
tree-sitter WASM scaffold + tier-1 queries · symbol entities/spans/hashes · `touches` upgraded
to symbol level · callers/callees facets · mention→symbol resolution · memory-anchor
invalidation via structural fingerprint (COSMETIC/STRUCTURAL) · incremental correctness trio
(1-hop boundary, shadow detection, shrink guard) · tree-sitter×SCIP arbitration.
Acceptance: symbol biography via `context(ref)` incl. symbol-level history + anchored memory;
anchor-drift test; per-language parity fixtures; multibyte span regression.

**M3 — Humans see it** (guide, full page set — maintainer: no cut)
M3 starts with a headless projection kernel inside `core`, then builds the guide as a view over it.
The projection contract is `EntityBiographyProjection`, `OverviewProjection`, `KnowledgeProjection`,
`EvidencePacket`, and `SearchProjection`; every projection carries claim-backed facts, per-profile
edge predicates/depth/node caps, omitted counts, freshness/coverage metadata, and perf records
(latency, entity/link fanout, serialized JSON bytes). After that: Hono loopback server + React/Vite
shell + system browser open; Entity Biography + Evidence Drawer first; Knowledge + Search next;
Overview / Decisions / History bounded graph views after the inspector paths are green; snapshot
export last. Live serve and export both consume the same JSON projections through the same render
components.
Acceptance: projection golden transcripts; Playwright smoke; every displayed fact traces to claim
provenance; no UI route computes graph semantics ad hoc; export diff test; projection perf records
for deterministic and living-repo tiers.

**M4 — Org context flows in** (network carriers, ingress-only)
Carrier snapshot framework first, then GitHub PR/issue, Jira stories/decisions, and Confluence
domain/docs as separate ingress-only adapters. Network carriers write dated local snapshots under the
external-SoR policy, never committed repo files and never outbound writes. Projection integration
comes through the same M3 projection interfaces: cross-carrier conflicts must surface in both
`context()` and guide without creating a carrier-specific UI path.
Acceptance: offline snapshot fixtures; credential redaction; ingress-only lint; freshness age
disclosed per carrier; cross-carrier conflicts visible in `context()` and guide.

**M5 — Hardening + free instrumentation** (record-only, features-before-measurement)
Turn the M3 records into hard gates: projection latency/fanout/serialized-size ceilings,
batched link reads where needed, optional per-generation projection caches, served/usage counters,
omitted-handle drill-down rate (the free retrieval-quality proxy), budget/envelope property tests,
and regression fixtures for hot guide/context paths. Only after those gates are stable do
CFG/def-use/effect-catalog style algorithms get a new decision gate; they are not M5 hardening by
default.

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

Everything is additive and local: bad store → `rm -r ~/.contexa/projects/<shard>` + `ctx sync`
(sources are authoritative — index-not-copy means nothing is lost). Push blocks are
sentinel-wrapped → removable by `ctx doctor --remove-push`. Importer snapshots are dated dirs —
delete = revert. No migration ever rewrites a source file outside managed blocks.

## 12. Absorption Register (mining round 2026-07-03, 5 reports, 12 repos — COMPLETE; + openwiki added post-round 2026-07-03)

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
| openwiki (langchain-ai) | `src/agent/prompt.ts` documentation-discipline clauses (→ our on-demand Inferred generation prompt, §7); content-snapshot no-op guard (SHA of output dir → don't republish when unchanged; for push digest + guide snapshot regeneration); `.last-update.json` gitHead-cursor+timestamp-fallback (confirms our `cursors` git-source pattern) | lift (prompt); port (no-op guard) |
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

**Legacy read-back map (P28 — carried items whose implementation-grade spec lives ONLY in the
June corpus; SUPERSEDED banners applied 2026-07-04, mechanism chapters kept as reference):**

| Carried item | Read back at | Location |
|---|---|---|
| D4 CFG/def-use bounded IR + flow projection | post-M2 | `docs/codemap/impl/appendix-A2-gitnexus.md:308–520`, `appendix-A3-reconciliation.md:219–249` |
| D16 SCIP consumer (streaming, position encodings, fail-open rollback) | M2 | `docs/codemap/impl/appendix-A1-copyable.md:480–500` |
| D23 parse-worker lifecycle numerics (recycle/timeout/OOM) | M2 | `docs/codemap/impl/D-language-coverage.md` |
| D13 default ignore-set (~50 dirs) | 1d/1e | `docs/codemap/impl/D-language-coverage.md:618` |
| D32 generation-identity tuple (ADR 0040) | 1b (restated §2 notes) | `docs/codemap/impl/E-freshness-incremental.md:73` |
| D22 `assertNoEgress()` mechanism | 1g (restated §7) | `docs/codemap/impl/M-cross-cutting.md` M14 |
| Output-economy budget bands + skeletonize mechanics | 1f/1g | `docs/codemap/impl/G-output-economy.md` |
| J5 confidence grading + honest-handoff/keep-but-tag rules | 1e | `docs/codemap/impl/J-correctness-trust.md` |
| D20 signing gate mechanics (no self-shipped PE → SHA256SUMS+provenance) | release | `docs/codemap/impl/L-distribution-runtime.md:775` |
| D19 VS Code policy-entry ladder (`chat.mcp.access` etc.) | VS Code adapter | `docs/codemap/impl/00-sources.md` |
| A/B measurement harness (uncached metric, headless runner) | M5 | `docs/codemap/impl/K-proof.md` |
| Host path-resolution precedent (`~/.copilot`, `~/.claude`) | 1h/1i | shipping tree `src/hook/copilot.ts`, `src/shim/hostAdapter.ts` |
