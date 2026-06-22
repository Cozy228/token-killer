# Community detection Optional; heuristic Process out; Flows Required via evidence-backed projection

Status: accepted

Two graph enrichments proposed from gitnexus (community detection, Process extraction) have
**different trust risk and must not share a capability state**.

## Community detection — Optional at runtime, default-off

A **derived architecture projection**, never a bounded context and never Domain truth. The
Core already produces package/module hierarchy, import SCC, connected components, and
callers-count/centrality, so **Architecture Intelligence is complete without it**; community
only adds an extra functional-cluster view for repos whose directory structure is
misleading. When community is off, cohesion ranking continues on the **callers-count
fallback** (already wired). gitnexus's Leiden is vendored and the repo is PolyForm
Noncommercial, so it **cannot be copied** — a real implementation comes from an
independently license-safe source or is written from scratch (label-propagation / connected
components suffice as the cheap form). Determinism (a fixed PRNG seed) is required only if it
is built, so reindex does not churn cluster ids.

## gitnexus-style Process — Outside current product scope

`HeuristicCallsBfsProcess` guesses entrypoints from naming/exports/caller-callee counts and
walks a bounded BFS over CALLS edges. That proves only **graph reachability** — not runtime
order, guard reachability, async event ordering, or state transitions. Even behind a
heuristic badge it would stand up a **second "flow truth"** beside the Required Behavior IR
and violate the A4.8 rule against asserting flow order without validated control flow. So we
**do not** build gitnexus-style permanent `Process` nodes or `STEP_IN_PROCESS` edges.

## Flows — Required, via EvidenceBackedFlowProjection

What is *out* is the heuristic mechanism, not the Flow capability. `Flows:` stays **Required**
and is served by an **`EvidenceBackedFlowProjection`**: starting from an entrypoint, it
composes resolved call-sites, CFG/CDG, guards, state transitions, events, writes, and side
effects (all from the already-Required Behavior IR), projects them **on demand**, and
explicitly returns coverage as **complete / partial / unknown**. It materializes no permanent
Process node.

## Consequences

- The unreliable mechanism is dropped while the user-facing capability (`Flows:`) is kept and
  routed through verifiable Behavior facts — one flow truth, not two.
- `C5` node-kind enum keeps `community` (Optional) and **drops `process`**; the
  `STEP_IN_PROCESS` edge kind and its reserved `step` field are removed from the materialized
  schema (flows are computed per query, consistent with ADR 0021).
- Resolves the doc self-contradiction (community was tagged both "Outside scope" and
  "Optional") in favor of **Optional at runtime, default-off**.
