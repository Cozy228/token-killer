# NL→code recall = Core-owned layered Query Vocabulary Bridge (agent hints additive, not primary)

Status: accepted

Stem expansion (`caching`→`cache`) only reaches the same root; it cannot bridge different
roots (`invalidate auth` → `revokeCredential`/`clearPrincipal`). The recall gap **cannot be
closed by any single mechanism**, and two tempting single-shot options are both wrong:

- A flat ≤200-entry **static domain synonym table** (the earlier "A5b" draft) — a universal
  wordlist cannot cover project jargon, and verbs like `clear`/`revoke`/`delete`/`invalidate`
  are **context-dependent**, not global synonyms.
- **Agent-supplied identifiers as the primary path** — if recall depends on the agent
  converting NL to symbol hints, then Human codeguide queries and non-cooperating agents lose
  NL query ability entirely. Agent hints must be **additive**, never the sole path.
- **Pure in-repo Random Indexing** is *not* evidenced by codebase-memory-mcp: its 0.75 is a
  fusion threshold over TF-IDF + RI + MinHash + API/type-signature + AST-profile signals (RI
  is only ~0.25 of it), its implementation **prefers a packaged nomic-embed-code 768-dim
  pretrained vector** and falls back to sparse RI only out-of-vocabulary, and it hand-writes
  abbreviation + code-pattern vocabulary. It proves "lexical rules + pretrained vectors +
  co-occurrence + structural signals → related-code edges", not "pure in-repo RI solves
  NL→code recall".

Instead the bridge is **Core-owned and layered**, so both Human codeguide and agents keep NL
recall:

1. **Lexical normalization** — stemming, abbreviations, and a small set of high-precision
   normalizations (`auth↔authentication`, `repo↔repository`).
2. **Action families, context-gated** — ~a dozen *low-weight* action families
   (`get/fetch/load`, `delete/remove/revoke/clear`, …). An action expands **only on a joint
   hit with an object word** (because those verbs are context-dependent). Candidate
   generation only — **never graph edges**.
3. **Provenance-carried project vocabulary** — built from docs, tests, API/schema, git
   renames, the Domain Model, and human confirmation; each term carries provenance (an
   Evidence-Graph fact with an authority level). This is what covers repo-specific jargon a
   universal table cannot.

**Agent hints** (`identifierHints[]` NL→symbol, `conceptHints[]` NL→domain-concept) are
passed via CodeQuery and weighted high, but remain **additive** to the Core bridge.

**In-repo co-occurrence** may be added, but first as an **explainable sparse association**
(not opaque RI/embedding), producing only **`RELATED_IN_REPOSITORY` candidate** edges —
never `SYNONYM_OF` and never trusted structural edges.

## Consequences

- NL recall is closed for both Human and agent surfaces without depending on agent
  cooperation, and **without overturning embeddings-Unsupported (A11)**: no pretrained
  vectors, no opaque dense-vector similarity.
- tk owns no growing flat synonym wordlist; durable repo vocabulary lives as
  provenance-carried Evidence-Graph facts, and weak in-repo associations are explicitly
  separated from trusted edges.
- The K harness `recall@k` measures "pure lexical+stem+families+project-vocab vs adding a
  sparse-association arm", finally giving the embeddings-OUT assumption a number.
