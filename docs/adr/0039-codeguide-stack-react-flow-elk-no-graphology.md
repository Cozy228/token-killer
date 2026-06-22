# Codeguide Web App stack: React + Vite + React Flow + ELK; no graphology / sigma / mermaid

The codeguide Web App ([ADR 0038](0038-codeguide-web-app-two-data-adapters.md)) is built on a
deliberately bounded stack. The Core stays the single graph authority; the frontend only lays out and
renders what the Core projects.

## Stack

| Component | Choice | Responsibility |
|---|---|---|
| Web framework | **React 19 + Vite + TypeScript** | pages, Tree, Inspector, Evidence Drawer |
| Graph render | **React Flow** | node/edge render, zoom, pan, select, click interaction |
| Graph layout | **ELK.js** | coordinates, layering, edge-crossing optimization, orthogonal edge routing |
| Graph semantics | **tk Core** | nodes, edges, grouping, aggregation, ranking, confidence, completeness |
| Client graph model | **NO graphology** | the frontend does not re-maintain an authoritative graph or run graph algorithms |
| Force-directed | **NO sigma / d3-force** | no whole-repo hairball |
| Diagram DSL | **NO mermaid** | no speculative / distortable diagrams |

## Data flow

```
Repository Intelligence Core
    ↓
GraphProjection { nodes, edges, containers, aggregated edges, omissions, completeness, expansion handles }
    ↓
ELK.js          (geometry layout only)
    ↓
React Flow      (render + interaction only)
```

## The explicit NO-s (and why)

- **No graphology.** It is a client-side graph data-structure + algorithm library; it is required by
  sigma and otherwise only earns its place running client-side graph algorithms (centrality, Louvain).
  tk's backend is the single graph authority and computes community / clustering server-side (ADR 0027
  / D15), so there is no client-side algorithm to run. Adding it would create a second graph model in
  the browser, contradicting "one Core". (understand-anything pulls graphology in *solely* for Louvain
  and renders with React Flow + ELK — the same render stack, minus the algorithm we don't need.)
- **No sigma / d3-force.** A whole-repo WebGL force layout has a hard scaling cliff (~25-30K nodes) and
  a "hairball" tends to look impressive while conveying little — the M21 fabricated-graph risk. React
  Flow renders only **bounded local neighborhoods (5–100 nodes)**; it is DOM/SVG-based and not meant
  for whole-repo rendering, which keeps the H1 "indented tree, not a whole-repo graph" line.
- **No mermaid.** Speculative, distortable diagrams are exactly what M21 forbids.

`GraphProjection` carries **omissions + completeness + expansion handles**, instantiating ADR 0036's
`presentationTruncated` / `completeness` model for the graph view: the viewer always shows what was
omitted and how to expand, and never presents a budget-truncated graph as complete.

(User-authored stack lock, grilling 2026-06-22 round 4.)
