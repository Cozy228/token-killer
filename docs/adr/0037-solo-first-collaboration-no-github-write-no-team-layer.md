# Collaboration is solo-first: local impact only, no GitHub-write adapter, no team layer

需求 I is positioned as a **solo-first Human Knowledge Workflow** — agent proposal, human edit +
accept, git share + review, and a local read-only impact report. It is naturally compatible with
future multi-person collaboration *through git*, but tk builds **no team product layer, no permission
layer, and no GitHub-write layer**.

## Decisions

- **`tk wiki impact <ref>` stays** — read-only, zero-egress markdown (diff → wiki-reference
  back-lookup + code-dependency back-lookup + stale marking) that the user pastes into a PR
  description. This already does the real Repository Intelligence work.
- **`tk wiki impact --comment` is permanently Unsupported.** Posting the markdown as a GitHub PR
  comment is just a remote-write adapter, but it drags in gh auth, PR discovery, permissions,
  duplicate-comment / update semantics, network failure, GitHub Enterprise, and a credential
  boundary. Breaking tk's zero-egress contract to save one copy-paste is not worth it; a user who
  wants automation can compose it externally (their own script or CI).
- **`tier:team` is deleted.** It carried no team identity, permissions, or collaboration semantics —
  it was only an honor-system bypass raising the page cap from 30 to 60. The page cap is a unified
  **technical** safety limit (`CAP_PAGES = 30`), independent of team size; if real wiki-quality or
  performance data later proves it insufficient, raise the cap directly rather than reintroducing a
  team tier.

## Why

These keep the no-server / no-egress / no-permission-layer contract intact (collaboration = git-shared
`.tk/` artifacts, inheriting git's existing permission model) and avoid building a team product for a
personal, never-published tool (see ADR 0024-personal-project / D24). The "no-s" are the point: tk does
the local intelligence and stops at the network boundary.

(User decision, grilling 2026-06-22 round 4. The human-surface *delivery* and *editing scope* are a
separate decision — see the RECONCILING of H/codeguide delivery.)
