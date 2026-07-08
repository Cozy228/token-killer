# Feedback for Rev 3 — `docs/runtime-startup-perf-plan.md`

Rev 2 is largely sound — keep its spine. Do **not** re-litigate: the op-count-over-ms
methodology, the bake-resolved-path Tier-1 item (2.1), the `--raw → stdio:inherit`
fix (2.5), and the rejection of SEA / Bun / `--build-snapshot`. Those stay.

The problem with Rev 2 is **sequencing and an unvalidated prerequisite**, not its
technique inventory. Three changes:

## 1. Re-sequence: EDR feasibility is a GATE before committing the daemon, not a parallel hand-off
Rev 2 says "commit the daemon now, don't wait for M8." That over-commits a 1–2 week
build (Go client + signing cert + named-pipe lifecycle + a new per-platform npm
distribution channel) before the cheapest, highest-leverage lever has been checked.

- The plan itself calls **EDR exclusion the single biggest lever**, and it helps the
  **bare tool too** (which the daemon can never beat). If corporate IT can grant a
  CrowdStrike exclusion for `node.exe` + `~/.contexa` + the shim dir org-wide,
  then **Tier-1 + exclusion may already be "good enough" and the daemon becomes moot.**
- So **M5 (exclusion size) and the exclusion's org-wide feasibility must be resolved
  BEFORE the daemon is committed**, not in parallel. Reframe §5 as a decision tree
  (below), not "ship Tier-1 + commit daemon simultaneously."

## 2. Add a prerequisite GATE for the daemon: does corporate EDR even tolerate it?
Rev 2 treats this as a one-line risk-register entry ("sign the client"). It is bigger
than that and belongs **ahead of M8**:

- The daemon is a **long-lived, self-spawned `node` background process + a named pipe
  + a custom (initially unsigned) native client.** That is precisely the behavioral
  pattern CrowdStrike Falcon is tuned to flag/kill/block. There is real irony: we add
  a persistent process to dodge the per-spawn AV tax, but persistent processes + IPC
  are what EDR watches hardest.
- Add a new gating item **M-pre (daemon EDR-tolerance):** on the target box / via IT,
  determine whether a persistent user-level node daemon + named pipe + a signed custom
  exe is *permitted to run and stay alive* under the org's Falcon policy (not killed,
  not quarantined, not blocked by application-control). If it is blocked, the daemon is
  dead on arrival regardless of M8 — so this gates the entire §4, **before** sizing M8.

## 3. Make §5 a decision tree; ship Tier-1 + re-measure BEFORE the daemon decision
Rev 2 under-sells doing Tier-1 first. The node-spawn floor is paid **once** per command;
the 630-stat storm is the **larger, more variable** block (its cost swings with whether
CrowdStrike happens to scan each `existsSync` or not). Removing it may move the
typical-case enough that the daemon's marginal value shrinks. Sequence:

1. **Ship Tier-1 blind** (bake-path, fs-op slimming, single-file CJS, cache ladder,
   `--raw` fix) — unchanged from Rev 2.
2. **Re-measure by op-count** (M0/M1b/M2) to confirm the ops are gone and observe the
   typical-case latency post-Tier-1.
3. **In parallel, resolve the cheap external levers:** file the CrowdStrike exclusion
   IT request (M5) **and** the M-pre daemon-tolerance inquiry.
4. **THEN branch:**
   - If EDR exclusion is grantable org-wide AND Tier-1 + exclusion lands in an
     acceptable latency range → **stop; daemon not needed.**
   - Else if M-pre says EDR tolerates a daemon → **build the daemon** (Rev 2's §4
     design is fine), sized by M8.
   - Else (exclusion not grantable AND daemon not tolerated) → document the hard floor
     honestly; ctx caps at "bare tool + 2 spawns − Tier-1 ops," and the box's own
     bare-tool latency is the wall.

## 4. State the optimization ceiling up front (move it into the Executive Summary)
Make this explicit and early, because it bounds every expectation:
**ctx can asymptotically reach ≈ (bare tool + one small constant); it can never beat the
bare tool. On this box the bare tool itself is 400–738 ms+ and jittery (same AV tax),
so "500–600 ms total" is reachable only in good weather AND only with the daemon
(possibly + EDR exclusion). "Native 300 ms" does not exist on this hardware.**

---

**Net:** Rev 3 keeps Rev 2's techniques and methodology verbatim, but (a) inserts
**M-pre** (daemon EDR-tolerance) as a gate ahead of M8, (b) moves **M5 / exclusion
feasibility ahead of the daemon commitment**, (c) rewrites §5 as the decision tree
above so the daemon is a *conditional* outcome rather than a pre-committed one, and
(d) leads with the optimization-ceiling statement. Do not expand scope beyond this.
